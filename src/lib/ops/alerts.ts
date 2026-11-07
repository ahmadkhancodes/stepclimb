import type { Db } from "@/lib/db";
import { adminEmails, env } from "@/lib/env";
import { log } from "@/lib/logger";
import { sendMail, type MailTransport } from "@/lib/mail";
import { noticeEmail } from "@/lib/mail/templates";
import { isTerminal, LIMITS, type RunDoc } from "@/lib/runs/types";

/**
 * Founder alerts (docs/ARCHITECTURE.md P0-1): stuck runs, failed webhooks, a stale cron heartbeat, a failed cron job.
 * Each alert has a stable key; the same key is mailed at most once per cooldown so a long outage is not a flood.
 */
export interface Alert { key: string; title: string; detail: string }

export const ALERT_COOLDOWN_MS = 60 * 60_000;
export const HEARTBEAT_MAX_AGE_MS = 2 * 60_000;
const STUCK_GRACE_MS = 2 * 60_000;
const WEBHOOK_WINDOW_MS = 15 * 60_000;

export async function recordHeartbeat(db: Db, name: string, now = new Date()) {
  await db.docs.put("heartbeats", name, { name, at: now });
}

export async function recordWebhookFailure(db: Db, provider: string, message: string, now = new Date()) {
  await db.docs.put("webhook_failures", `${provider}:${now.getTime()}:${Math.random().toString(36).slice(2, 8)}`, { provider, message: message.slice(0, 300), at: now, expireAt: new Date(now.getTime() + 30 * 86_400_000) });
}

export async function collectAlerts(db: Db, now = new Date()): Promise<Alert[]> {
  const t = now.getTime();
  const out: Alert[] = [];

  const runs = (await db.docs.find<RunDoc>("runs")).filter((r) => !isTerminal(r.status));
  const stuck = runs.filter((r) =>
    (r.deadlineAt !== null && t > r.deadlineAt + STUCK_GRACE_MS) ||
    (r.status === "queued" && t - new Date(r.createdAt).getTime() > 5 * 60_000) ||
    (r.status === "running" && t - new Date(r.updatedAt).getTime() > LIMITS.silenceMs + STUCK_GRACE_MS));
  if (stuck.length) out.push({ key: "stuck_runs", title: `${stuck.length} stuck run${stuck.length === 1 ? "" : "s"}`, detail: `Runs past their limit or silent: ${stuck.slice(0, 10).map((r) => `${r.id} (${r.status}, ${r.fullName})`).join("; ")}. The reaper should have stopped them: check /api/cron/reap and the sandbox list.` });

  const failures = (await db.docs.find<{ provider: string; message: string; at: Date }>("webhook_failures")).filter((f) => t - new Date(f.at).getTime() <= WEBHOOK_WINDOW_MS);
  for (const provider of [...new Set(failures.map((f) => f.provider))]) {
    const mine = failures.filter((f) => f.provider === provider);
    out.push({ key: `webhook_failed:${provider}`, title: `${mine.length} failed ${provider} webhook${mine.length === 1 ? "" : "s"} in 15 minutes`, detail: `Latest: ${mine.at(-1)!.message}. Stripe and GitHub retry, but check the endpoint and its secret.` });
  }

  const beat = await db.docs.get<{ at: Date }>("heartbeats", "cron");
  if (beat && t - new Date(beat.at).getTime() > HEARTBEAT_MAX_AGE_MS)
    out.push({ key: "cron_heartbeat", title: "Cron heartbeat is stale", detail: `The last cron tick was ${Math.round((t - new Date(beat.at).getTime()) / 60_000)} minutes ago. Check the Cloudflare cron worker and CRON_SECRET.` });
  return out;
}

export const alertRecipients = () => {
  const list = (env().ALERT_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.length ? list : adminEmails();
};

/** Mails new alerts to the founder (transactional, so unsubscribes do not hide outages). Returns what was sent and what the cooldown held back. */
export async function sendAlerts(db: Db, alerts: Alert[], opts: { now?: Date; transport?: MailTransport; to?: string[] } = {}): Promise<{ sent: string[]; held: string[]; noRecipient: boolean }> {
  const now = opts.now ?? new Date();
  const to = opts.to ?? alertRecipients();
  const res = { sent: [] as string[], held: [] as string[], noRecipient: to.length === 0 };
  for (const a of alerts) {
    const prev = await db.docs.get<{ lastSentAt: Date }>("alert_state", a.key);
    if (prev && now.getTime() - new Date(prev.lastSentAt).getTime() < ALERT_COOLDOWN_MS) { res.held.push(a.key); continue; }
    log.error("alert", { code: a.key, message: a.title });
    if (to.length === 0) continue;
    const m = noticeEmail({ title: `Stepclimb alert: ${a.title}`, body: a.detail });
    for (const addr of to) await sendMail({ to: addr, ...m, category: "transactional", tags: { kind: "alert" } }, opts.transport, db);
    await db.docs.put("alert_state", a.key, { key: a.key, lastSentAt: now });
    res.sent.push(a.key);
  }
  return res;
}

/** A cron job threw: alert straight away (same cooldown). */
export const alertCronFailure = (db: Db, job: string, message: string, opts: { now?: Date; transport?: MailTransport } = {}) =>
  sendAlerts(db, [{ key: `cron_failed:${job}`, title: `Cron job ${job} failed`, detail: message.slice(0, 500) }], opts);
