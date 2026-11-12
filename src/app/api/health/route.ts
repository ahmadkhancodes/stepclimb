import { getDb } from "@/lib/db";
import { dbDriver, env } from "@/lib/env";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const withTimeout = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

/**
 * Liveness plus real dependency state. Only the database decides the status code (2 s cap, 503 when it does not answer).
 * Billing and mail report "configured" or "missing" so an uptime check sees a missing key; nothing here names a host,
 * a key, a version of a secret or an error message.
 */
export async function GET() {
  const e = env();
  const t0 = Date.now();
  let dbOk = false;
  try {
    await withTimeout(getDb().then((db) => db.docs.get("health", "ping")), 2_000);
    dbOk = true;
  } catch { /* reported as dbOk: false */ }
  const deps = {
    db: dbOk ? "ok" : "down",
    billing: e.STRIPE_SECRET_KEY && e.STRIPE_WEBHOOK_SECRET ? "configured" : "missing",
    mail: e.MAIL_PROVIDER === "none" ? "off" : e.RESEND_API_KEY || e.MAIL_PROVIDER === "console" || e.MAIL_PROVIDER === "smtp" ? "configured" : "missing",
  };
  const body = { ok: dbOk, db: dbDriver(), dbOk, deps, dbLatencyMs: dbOk ? Date.now() - t0 : null, version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev", at: new Date().toISOString() };
  return json(body, dbOk ? 200 : 503);
}
