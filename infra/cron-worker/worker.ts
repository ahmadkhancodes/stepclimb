/**
 * Cloudflare Worker cron entry: ticks every minute and calls /api/cron/<job> with CRON_SECRET (Vercel Hobby allows 1 cron/day).
 * JOBS = every minute (reap, heartbeat, alerts, webhook-retries). HOURLY_JOBS = minute 0 (autopilot: it picks repos whose
 * local time is Monday 06:00). DAILY_JOBS = 02:00 UTC (backup). All jobs are idempotent, so a repeated tick is harmless.
 * Deploy: cd infra/cron-worker && npx wrangler secret put CRON_SECRET && npx wrangler deploy
 */
interface Env { APP_URL: string; CRON_SECRET: string; JOBS: string; HOURLY_JOBS?: string; DAILY_JOBS?: string }

const list = (s: string | undefined) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);

/** Which jobs run at this tick. Exported for the unit test. */
export function jobsFor(env: Pick<Env, "JOBS" | "HOURLY_JOBS" | "DAILY_JOBS">, at: Date): string[] {
  const jobs = list(env.JOBS);
  if (at.getUTCMinutes() === 0) jobs.push(...list(env.HOURLY_JOBS));
  if (at.getUTCMinutes() === 0 && at.getUTCHours() === 2) jobs.push(...list(env.DAILY_JOBS));
  return jobs;
}

export default {
  async scheduled(event: { scheduledTime?: number }, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    for (const job of jobsFor(env, new Date(event.scheduledTime ?? Date.now()))) {
      ctx.waitUntil(
        fetch(`${env.APP_URL}/api/cron/${job}`, { method: "POST", headers: { authorization: `Bearer ${env.CRON_SECRET}` } })
          .then((r) => { if (!r.ok) console.error(`cron ${job} -> ${r.status}`); }),
      );
    }
  },
};
