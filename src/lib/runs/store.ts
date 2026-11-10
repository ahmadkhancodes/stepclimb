import type { Db } from "@/lib/db";
import { randomToken, uuidv7 } from "@/lib/ids";
import { LIMITS, TRANSITIONS, isTerminal, type CreditDoc, type CreditKind, type RunDoc, type RunLogDoc, type RunStatus, type RunStepDoc, type SquawkDoc, type StepStatus } from "./types";

type Id<T> = T & { id: string };
export class RunStateError extends Error {}

export interface NewRun {
  accountId: string; repoId: string; installationId: string; fullName: string; baseBranch: string; appPath?: string;
  hopFrom: number; hopTo: number; kind?: RunDoc["kind"]; billing: RunDoc["billing"]; idempotencyKey?: string | null; extendedVerify?: boolean; now?: Date;
}

export async function createRun(db: Db, n: NewRun): Promise<{ run: Id<RunDoc>; created: boolean }> {
  if (n.idempotencyKey) {
    const [hit] = await db.docs.find<RunDoc>("runs", { accountId: n.accountId, idempotencyKey: n.idempotencyKey }, { limit: 1 });
    if (hit) return { run: hit, created: false };
  }
  const now = n.now ?? new Date();
  const id = uuidv7(now.getTime());
  const doc: RunDoc = {
    accountId: n.accountId, repoId: n.repoId, installationId: n.installationId, fullName: n.fullName, ownerLogin: n.fullName.split("/")[0]!.toLowerCase(), baseBranch: n.baseBranch, appPath: n.appPath ?? "",
    kind: n.kind ?? "upgrade", status: "queued", hopFrom: n.hopFrom, hopTo: n.hopTo, branch: null, headSha: null, prNumber: null, prUrl: null, prDraft: false,
    checkConclusion: null, verified: null, repairPasses: 0, repairRulesApplied: [], computeSeconds: 0, sandboxId: null, billing: n.billing,
    idempotencyKey: n.idempotencyKey ?? null, extendedVerify: n.extendedVerify ?? false, eventSecret: randomToken(24), lastSeq: 0, error: null, effortBand: null,
    createdAt: now, startedAt: null, finishedAt: null, deadlineAt: null, leaseUntil: null, updatedAt: now,
  };
  await db.docs.put("runs", id, doc as unknown as Record<string, unknown>);
  return { run: { ...doc, id }, created: true };
}

export const getRun = (db: Db, id: string) => db.docs.get<RunDoc>("runs", id);
export const listRuns = (db: Db, accountId: string, limit = 50) => db.docs.find<RunDoc>("runs", { accountId }, { sort: { field: "createdAt", dir: -1 }, limit });

/** Moves a run along the state machine; illegal moves throw. Terminal runs never change status again. */
export async function transition(db: Db, id: string, to: RunStatus, patch: Partial<RunDoc> = {}, now = new Date()): Promise<Id<RunDoc>> {
  const run = await getRun(db, id);
  if (!run) throw new RunStateError("run_not_found");
  if (run.status === to) return run;
  if (!TRANSITIONS[run.status].includes(to)) throw new RunStateError(`illegal_transition_${run.status}_to_${to}`);
  const next: Partial<RunDoc> = { ...patch, status: to, updatedAt: now, ...(isTerminal(to) ? { finishedAt: now, leaseUntil: null } : {}) };
  await db.docs.put("runs", id, next as unknown as Record<string, unknown>);
  return { ...run, ...next };
}

export const patchRun = (db: Db, id: string, patch: Partial<RunDoc>) => db.docs.put("runs", id, { ...patch, updatedAt: new Date() } as unknown as Record<string, unknown>);

export async function addStep(db: Db, runId: string, s: { name: string; status: StepStatus; detail?: string; durationMs?: number }): Promise<void> {
  const prior = await db.docs.find<RunStepDoc>("run_steps", { runId, name: s.name }, { limit: 1 });
  const existing = prior[0];
  if (existing) {
    await db.docs.put("run_steps", existing.id, { status: s.status, detail: s.detail ?? existing.detail, durationMs: s.durationMs ?? existing.durationMs });
    return;
  }
  const all = await db.docs.find<RunStepDoc>("run_steps", { runId });
  const seq = all.length + 1;
  await db.docs.put("run_steps", `${runId}:${String(seq).padStart(4, "0")}`, { runId, seq, name: s.name, status: s.status, detail: s.detail ?? null, durationMs: s.durationMs ?? null, createdAt: new Date() } satisfies RunStepDoc);
}
export const listSteps = async (db: Db, runId: string) => (await db.docs.find<RunStepDoc>("run_steps", { runId })).sort((a, b) => a.seq - b.seq);

/** Appends a log chunk (capped per run and per chunk). Callers pass already redacted text. */
export async function appendLog(db: Db, runId: string, stream: RunLogDoc["stream"], text: string): Promise<boolean> {
  const count = (await db.docs.find<RunLogDoc>("run_logs", { runId })).length;
  if (count >= LIMITS.maxLogChunksPerRun) return false;
  const seq = count + 1;
  await db.docs.put("run_logs", `${runId}:${String(seq).padStart(6, "0")}`, { runId, seq, stream, text: text.slice(0, LIMITS.maxLogChunk), at: new Date() } satisfies RunLogDoc);
  return true;
}
/** Retention (security page: "logs are kept 30 days"): deletes log chunks of runs that finished more than `days` ago. */
export async function purgeOldLogs(db: Db, now = new Date(), days = LIMITS.logRetentionDays): Promise<{ runs: number }> {
  const cutoff = now.getTime() - days * 86_400_000;
  const old = (await db.docs.find<RunDoc & { logsPurged?: boolean }>("runs")).filter((r) => isTerminal(r.status) && !r.logsPurged && new Date(r.finishedAt ?? r.updatedAt).getTime() < cutoff);
  for (const r of old) {
    await db.docs.remove("run_logs", { runId: r.id });
    await db.docs.put("runs", r.id, { logsPurged: true });
  }
  return { runs: old.length };
}
export async function listLogs(db: Db, runId: string, afterSeq = 0): Promise<Id<RunLogDoc>[]> {
  return (await db.docs.find<RunLogDoc>("run_logs", { runId })).filter((l) => l.seq > afterSeq).sort((a, b) => a.seq - b.seq);
}

export async function saveSquawks(db: Db, runId: string, list: Omit<SquawkDoc, "runId" | "resolvedBy" | "createdAt">[]): Promise<void> {
  await db.docs.remove("squawks", { runId });
  let i = 0;
  for (const s of list) await db.docs.put("squawks", `${runId}:${String(++i).padStart(4, "0")}`, { ...s, runId, resolvedBy: null, createdAt: new Date() } as unknown as Record<string, unknown>);
}
export const listSquawks = async (db: Db, runId: string) => (await db.docs.find<SquawkDoc>("squawks", { runId })).sort((a, b) => a.id.localeCompare(b.id));

// ---- credits (one time packs bought through Stripe Checkout) ----
export async function grantCredit(db: Db, accountId: string, kind: CreditKind, stripeSessionId: string | null, now = new Date(), paymentIntentId: string | null = null): Promise<boolean> {
  const id = stripeSessionId ? `sess:${stripeSessionId}` : uuidv7(now.getTime());
  const doc: CreditDoc = { accountId, kind, remaining: 1, expiresAt: new Date(now.getTime() + LIMITS.creditTtlDays * 86_400_000), stripeSessionId, paymentIntentId, createdAt: now };
  return db.docs.insert("credits", id, doc as unknown as Record<string, unknown>); // idempotent per Checkout session
}
export async function availableCredit(db: Db, accountId: string, kind: CreditKind, now = new Date()): Promise<Id<CreditDoc> | null> {
  const list = (await db.docs.find<CreditDoc>("credits", { accountId, kind })).filter((c) => c.remaining > 0 && new Date(c.expiresAt).getTime() > now.getTime());
  return list.sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime())[0] ?? null;
}
/**
 * Spends one unit. Race safe without transactions: each spend first inserts a unique claim `<credit>:<spent>`, so two
 * parallel starts that read the same credit cannot both win it (the loser retries on the next credit or gets null).
 */
export async function consumeCredit(db: Db, accountId: string, kind: CreditKind, now = new Date()): Promise<string | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const c = await availableCredit(db, accountId, kind, now);
    if (!c) return null;
    const spent = (c as CreditDoc & { spent?: number }).spent ?? 0;
    if (!(await db.docs.insert("credit_claims", `${c.id}:${spent}`, { creditId: c.id, accountId, at: now }))) continue;
    await db.docs.put("credits", c.id, { remaining: c.remaining - 1, spent: spent + 1 });
    return c.id;
  }
  return null;
}
/** A Stripe refund took the money back (P1-11): zero the matching credit if it is still unspent. Returns the credits found and the ones revoked. */
export async function revokeCreditsForPayment(db: Db, paymentIntentId: string): Promise<{ found: number; revoked: number }> {
  const list = await db.docs.find<CreditDoc>("credits", { paymentIntentId });
  let revoked = 0;
  for (const c of list) {
    if (c.remaining <= 0) continue;
    const spent = (c as CreditDoc & { spent?: number }).spent ?? 0;
    // same unique claim as a spend, so a start racing this refund cannot also win the credit
    if (!(await db.docs.insert("credit_claims", `${c.id}:${spent}`, { creditId: c.id, accountId: c.accountId, at: new Date(), revoked: true }))) continue;
    await db.docs.put("credits", c.id, { remaining: 0, spent: spent + 1, revokedAt: new Date() });
    revoked++;
  }
  return { found: list.length, revoked };
}
export async function refundCredit(db: Db, creditId: string): Promise<void> {
  const c = await db.docs.get<CreditDoc>("credits", creditId);
  if (c) await db.docs.put("credits", creditId, { remaining: c.remaining + 1 });
}
