import { getDb } from "@/lib/db";
import { dbDriver } from "@/lib/env";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness plus a database read (2 s cap): 503 when the database does not answer, so uptime checks see a Mongo outage. */
export async function GET() {
  const base = { db: dbDriver(), version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev", at: new Date().toISOString() };
  try {
    await Promise.race([
      getDb().then((db) => db.docs.get("health", "ping")),
      new Promise((_, reject) => setTimeout(() => reject(new Error("db_timeout")), 2_000)),
    ]);
    return json({ ok: true, ...base, dbOk: true });
  } catch {
    return json({ ok: false, ...base, dbOk: false }, 503);
  }
}
