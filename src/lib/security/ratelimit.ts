import { getDb } from "@/lib/db";
import type { Db } from "@/lib/db/types";
import { clientIp, HttpError } from "@/lib/http";

// Mongo sliding-window rate limiter (new code: neither app had one; BACKEND_REUSE 1.9).
export interface Rule { limit: number; windowMs: number }

export const RULES = {
  authIp: { limit: 20, windowMs: 10 * 60_000 },
  authEmail: { limit: 5, windowMs: 10 * 60_000 },
  billing: { limit: 10, windowMs: 60_000 },
  account: { limit: 5, windowMs: 60 * 60_000 },
  publicForm: { limit: 30, windowMs: 60_000 },
  inviteIp: { limit: 30, windowMs: 60 * 60_000 },
  inviteEmail: { limit: 3, windowMs: 60 * 60_000 },
  webhookIp: { limit: 300, windowMs: 60_000 },
  api: { limit: 600, windowMs: 60_000 },
} satisfies Record<string, Rule>;

export async function rateLimit(key: string, rule: Rule, db?: Db, now = Date.now()) {
  const d = db ?? (await getDb());
  const hits = await d.hitRateLimit(key, rule.windowMs, now);
  return { ok: hits <= rule.limit, remaining: Math.max(0, rule.limit - hits), resetMs: rule.windowMs };
}

/** Throws 429 rate_limited when over. */
export async function enforceRateLimit(key: string, rule: Rule, db?: Db) {
  const r = await rateLimit(key, rule, db);
  if (!r.ok) throw new HttpError(429, "rate_limited", { retryAfterSeconds: Math.ceil(rule.windowMs / 1000) });
  return r;
}

/** Throws 429 when this client is over `rule` for `name` (per IP). For public routes without a session. */
export async function limitByIp(req: Request, name: string, rule: Rule, db?: Db) {
  return enforceRateLimit(`ip:${name}:${clientIp(req)}`, rule, db);
}

/**
 * Flood guard for signed webhook endpoints, per IP and before any body parsing or crypto. The limit is far above real
 * delivery rates (Stripe, GitHub and Resend send a few events a second at most), so only abuse trips it; a 429 makes
 * the sender retry. Fails open if the limiter itself is down: a signed webhook must not be lost to a rate limit outage.
 */
export async function webhookFlood(req: Request, db?: Db): Promise<boolean> {
  try { return !(await rateLimit(`ip:webhook:${clientIp(req)}`, RULES.webhookIp, db)).ok; } catch { return false; }
}
