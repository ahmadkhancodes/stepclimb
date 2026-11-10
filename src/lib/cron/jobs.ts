import { runAutopilot } from "@/lib/autopilot/job";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { memoryStore, mongoStore, runBackup, type BackupSink, type CollectionStore } from "@/lib/ops/backup";
import { alertCronFailure, collectAlerts, recordHeartbeat, sendAlerts } from "@/lib/ops/alerts";
import { getRunDeps } from "@/lib/runs/runtime";
import { reapRuns } from "@/lib/runs/service";
import { purgeOldLogs } from "@/lib/runs/store";
import { retryDueDeliveries } from "@/lib/webhooks/outbound";

/** The live collection store for the configured driver (Mongo: every product collection; memory: the `Db.docs` list). */
export async function liveStore(): Promise<CollectionStore> {
  const e = env();
  if (e.MONGODB_URI && e.DB_DRIVER !== "memory") {
    const { mongoClient } = await import("@/lib/db/mongo");
    return mongoStore((await mongoClient(e.MONGODB_URI)).db(e.MONGODB_DB ?? e.APP_NAME) as never);
  }
  return memoryStore(await getDb());
}

/** Backup destination. Cloudflare R2 plugs in here once the bucket exists (docs/MANUAL_STEPS.md); until then only the manifest is recorded. */
function backupSink(): BackupSink | null {
  return null;
}

/** Register cron jobs here. Each must be idempotent and finish well inside maxDuration. */
export const cronJobs: Record<string, () => Promise<unknown>> = {
  "webhook-retries": () => retryDueDeliveries({ limit: 100 }),
  /** watchdog: wall clock, stalled runs, leaked sandboxes, stuck queue */
  reap: async () => {
    const deps = await getRunDeps(await getDb());
    return deps ? reapRuns(deps) : { skipped: "runner_unavailable" };
  },
  /** hourly: weekly dependency PRs for repos whose local time is Monday 06:00 */
  autopilot: async () => {
    const deps = await getRunDeps(await getDb());
    return deps ? runAutopilot(deps) : { skipped: "runner_unavailable" };
  },
  /** every minute: proves the scheduler is alive (the alerts job reads it) */
  heartbeat: async () => {
    await recordHeartbeat(await getDb(), "cron");
    return { at: new Date().toISOString() };
  },
  /** every minute: stuck runs, failed webhooks, stale heartbeat -> founder email (1 hour cooldown per alert) */
  alerts: async () => {
    const db = await getDb();
    return sendAlerts(db, await collectAlerts(db));
  },
  /** nightly: delete run logs 30 days after the run ended (security page promise) */
  retention: async () => purgeOldLogs(await getDb()),
  /** nightly export of the product collections */
  backup: async () => {
    const r = await runBackup(await getDb(), await liveStore(), backupSink());
    return { name: r.name, stored: r.stored, collections: Object.keys(r.counts).length };
  },
};

/**
 * The one daily run (vercel.json). Vercel Hobby fires cron once a day, so everything periodic
 * (watchdog, weekly autopilot, webhook retries, retention, backup, alerts) happens here, one job after
 * another, inside a time budget below the function limit. A failing job never blocks the next.
 */
const DAILY_BUDGET_MS = 50_000;
const DAILY_ORDER = ["reap", "autopilot", "webhook-retries", "retention", "backup", "alerts"] as const;
cronJobs.daily = async () => {
  const started = Date.now();
  const out: Record<string, unknown> = {};
  for (const name of DAILY_ORDER) {
    if (Date.now() - started > DAILY_BUDGET_MS) { out[name] = { skipped: "time_budget" }; continue; }
    try { out[name] = await cronJobs[name]!(); } catch (e) {
      out[name] = { error: (e as Error).message };
      if (name !== "alerts") await reportCronFailure(name, (e as Error).message);
    }
  }
  return out;
};

/** Wraps a job failure into a founder alert (used by the cron route). */
export const reportCronFailure = async (job: string, message: string) => {
  try { await alertCronFailure(await getDb(), job, message); } catch { /* alerting must never mask the original failure */ }
};
