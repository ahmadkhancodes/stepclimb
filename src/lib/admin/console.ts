import { join } from "node:path";
import type Stripe from "stripe";
import { audit } from "@/lib/audit";
import type { Db } from "@/lib/db";
import { loadRecipes } from "@/lib/engine/recipes";
import { loadRules } from "@/lib/engine/repair";
import { LATEST_LARAVEL_MAJOR } from "@/lib/engine/detect";
import { collectAlerts } from "@/lib/ops/alerts";
import { loadPins, setPin, type Pin } from "@/lib/runs/pins";
import { listLogs, listSquawks, listSteps, patchRun, refundCredit } from "@/lib/runs/store";
import { isTerminal, type CreditDoc, type RunDoc } from "@/lib/runs/types";

/** Founder admin console logic: run inspector, rule and recipe pinning, refund tool, usage overview, path flags. */
type Id<T> = T & { id: string };

export async function adminRuns(db: Db, opts: { status?: string; limit?: number } = {}): Promise<Id<RunDoc>[]> {
  const all = await db.docs.find<RunDoc>("runs", opts.status ? { status: opts.status } : {}, { sort: { field: "createdAt", dir: -1 }, limit: opts.limit ?? 100 });
  return all;
}

export async function adminRunDetail(db: Db, id: string) {
  const run = await db.docs.get<RunDoc>("runs", id);
  if (!run) return null;
  const credit = run.billing.creditId ? await db.docs.get<CreditDoc>("credits", run.billing.creditId) : null;
  return { run, steps: await listSteps(db, id), logs: (await listLogs(db, id)).slice(-200), squawks: await listSquawks(db, id), credit };
}

export interface UsageOverview {
  runs: { total: number; last30d: number; byStatus: Record<string, number>; byBilling: Record<string, number>; autopilot: number; computeSeconds: number };
  verifiedRate: number | null;
  accounts: number;
  creditsOutstanding: Record<string, number>;
  openAlerts: { key: string; title: string }[];
  lastBackup: { name: string; createdAt: string; stored: boolean } | null;
  unmatched: { signature: string; count: number }[];
  autopilotRepos: number;
}

export async function usageOverview(db: Db, now = new Date()): Promise<UsageOverview> {
  const runs = await db.docs.find<RunDoc>("runs");
  const since = now.getTime() - 30 * 86_400_000;
  const byStatus: Record<string, number> = {};
  const byBilling: Record<string, number> = {};
  for (const r of runs) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    byBilling[r.billing.via] = (byBilling[r.billing.via] ?? 0) + 1;
  }
  const done = runs.filter((r) => r.status === "succeeded" && r.kind === "upgrade");
  const credits = (await db.docs.find<CreditDoc>("credits")).filter((c) => c.remaining > 0 && new Date(c.expiresAt).getTime() > now.getTime());
  const creditsOutstanding: Record<string, number> = {};
  for (const c of credits) creditsOutstanding[c.kind] = (creditsOutstanding[c.kind] ?? 0) + c.remaining;
  const backups = (await db.docs.find<{ name: string; createdAt: Date; stored: boolean }>("backup_manifests", {}, { sort: { field: "createdAt", dir: -1 }, limit: 1 }))[0];
  const unmatched = (await db.docs.find<{ signature: string; count: number }>("unmatched_signatures")).sort((a, b) => b.count - a.count).slice(0, 10);
  return {
    runs: { total: runs.length, last30d: runs.filter((r) => new Date(r.createdAt).getTime() >= since).length, byStatus, byBilling, autopilot: runs.filter((r) => r.kind === "autopilot").length, computeSeconds: runs.reduce((n, r) => n + (r.computeSeconds || 0), 0) },
    verifiedRate: done.length ? done.filter((r) => r.checkConclusion === "success").length / done.length : null,
    accounts: new Set(runs.map((r) => r.accountId)).size,
    creditsOutstanding,
    openAlerts: (await collectAlerts(db, now)).map((a) => ({ key: a.key, title: a.title })),
    lastBackup: backups ? { name: backups.name, createdAt: new Date(backups.createdAt).toISOString(), stored: backups.stored } : null,
    unmatched: unmatched.map((u) => ({ signature: u.signature, count: u.count })),
    autopilotRepos: (await db.docs.find("repos", { autopilotWeekly: true })).length,
  };
}

// ---- pinning ----
export interface PinRow { key: string; version: string; title: string; unverified: boolean; pin: Pin | null }

export async function pinRows(db: Db, root = process.cwd()): Promise<{ recipes: PinRow[]; rules: PinRow[] }> {
  const pins = await loadPins(db);
  const recipes = loadRecipes(join(root, "recipes")).map((r) => ({ key: r.key, version: r.version, title: r.title, unverified: !!r.unverified, pin: pins.recipes[r.key] ?? null }));
  const rules = loadRules(join(root, "repair-rules")).map((r) => ({ key: r.key, version: r.version, title: r.title, unverified: !!r.unverified, pin: pins.rules[r.key] ?? null }));
  return { recipes, rules };
}

export async function adminSetPin(db: Db, actorId: string, kind: "recipes" | "rules", key: string, pin: Pin | null, root = process.cwd()) {
  const known = kind === "recipes" ? loadRecipes(join(root, "recipes")).map((r) => r.key) : loadRules(join(root, "repair-rules")).map((r) => r.key);
  if (!known.includes(key)) throw new AdminError("unknown_key");
  const next = await setPin(db, kind, key, pin);
  await audit({ orgId: null, actorId, action: "admin.pin", target: `${kind}:${key}`, meta: { disabled: !!pin?.disabled, version: pin?.version ?? null } });
  return next;
}

// ---- upgrade path flags ----
export const PATHS = Array.from({ length: LATEST_LARAVEL_MAJOR - 10 }, (_, i) => ({ from: 10 + i, to: 11 + i, flag: `path_laravel_${10 + i}_to_${11 + i}` }));

export async function adminSetPathFlag(db: Db, actorId: string, flag: string, on: boolean) {
  if (!PATHS.some((p) => p.flag === flag)) throw new AdminError("unknown_flag");
  await db.setConfig(flag, on ? "on" : "off");
  await audit({ orgId: null, actorId, action: "admin.flag", target: flag, meta: { value: on ? "on" : "off" } });
}

// ---- refunds ----
export class AdminError extends Error { constructor(readonly code: string, readonly status = 400) { super(code); } }

/** Money back through the payment provider. The real adapter only touches objects tagged `metadata.app` for this app. */
export interface MoneyRefunder { refundCheckoutSession(sessionId: string, meta: { runId: string }): Promise<{ id: string }> }

export function stripeRefunder(stripe: Pick<Stripe, "checkout" | "refunds">, app: string): MoneyRefunder {
  return {
    async refundCheckoutSession(sessionId, meta) {
      const s = await stripe.checkout.sessions.retrieve(sessionId);
      if (s.metadata?.app !== app) throw new AdminError("foreign_object", 403);
      const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
      if (!pi) throw new AdminError("no_payment_to_refund");
      const r = await stripe.refunds.create({ payment_intent: pi, metadata: { app, run_id: meta.runId } });
      return { id: r.id };
    },
  };
}

/**
 * Refund tool. `credit`: give the run's credit back (the customer can start the run again). `money`: refund the Checkout
 * payment that bought the credit and burn the credit so it cannot be used again. Both are audited and happen once per run.
 */
export async function refundRun(db: Db, i: { runId: string; mode: "credit" | "money"; actorId: string; reason: string }, refunder?: MoneyRefunder): Promise<{ mode: string; refundId?: string }> {
  const run = await db.docs.get<RunDoc>("runs", i.runId);
  if (!run) throw new AdminError("not_found", 404);
  if (!isTerminal(run.status)) throw new AdminError("run_still_open", 409);
  if (run.creditRefunded) throw new AdminError("already_refunded", 409);
  if (run.billing.via !== "credit" || !run.billing.creditId) throw new AdminError("nothing_to_refund");
  const credit = await db.docs.get<CreditDoc>("credits", run.billing.creditId);
  let refundId: string | undefined;
  if (i.mode === "credit") await refundCredit(db, run.billing.creditId);
  else {
    if (!refunder) throw new AdminError("billing_unavailable", 503);
    if (!credit?.stripeSessionId) throw new AdminError("no_payment_to_refund");
    refundId = (await refunder.refundCheckoutSession(credit.stripeSessionId, { runId: run.id })).id;
    await db.docs.put("credits", run.billing.creditId, { remaining: 0 });
  }
  await patchRun(db, run.id, { creditRefunded: true });
  await audit({ orgId: run.accountId, actorId: i.actorId, action: "admin.refund", target: run.id, meta: { mode: i.mode, reason: i.reason.slice(0, 200), refundId: refundId ?? null } });
  return { mode: i.mode, ...(refundId ? { refundId } : {}) };
}
