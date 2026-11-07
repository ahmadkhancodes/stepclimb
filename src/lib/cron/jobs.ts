import { getDb } from "@/lib/db";
import { getRunDeps } from "@/lib/runs/runtime";
import { reapRuns } from "@/lib/runs/service";
import { retryDueDeliveries } from "@/lib/webhooks/outbound";

/** Register cron jobs here. Each must be idempotent and finish well inside maxDuration. */
export const cronJobs: Record<string, () => Promise<unknown>> = {
  "webhook-retries": () => retryDueDeliveries({ limit: 100 }),
  /** watchdog: wall clock, stalled runs, leaked sandboxes, stuck queue */
  reap: async () => {
    const deps = await getRunDeps(await getDb());
    return deps ? reapRuns(deps) : { skipped: "runner_unavailable" };
  },
  heartbeat: async () => ({ at: new Date().toISOString() }),
};
