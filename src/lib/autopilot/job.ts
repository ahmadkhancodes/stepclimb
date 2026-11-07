import type { Db } from "@/lib/db";
import type { RepoDoc } from "@/lib/github/sync";
import { log } from "@/lib/logger";
import { dispatchRun, isSubscriber, RunError, startRun, type RunDeps } from "@/lib/runs/service";
import { isAutopilotWindow, validTimezone, weekKey } from "./schedule";
import { getState, putState } from "./state";

export interface AutopilotReport { checked: number; started: string[]; skipped: Record<string, string> }

interface AppRow { path: string; laravelMajor: number | null; supported: boolean }

/**
 * Hourly cron. For every repo with weekly autopilot on whose local time is inside Monday 06:00, start one dependency
 * update run (once per ISO week), only for paying accounts. An open autopilot PR is refreshed by the run, not duplicated.
 */
export async function runAutopilot(d: RunDeps, now: Date = new Date()): Promise<AutopilotReport> {
  const { db } = d;
  const rep: AutopilotReport = { checked: 0, started: [], skipped: {} };
  const repos = await db.docs.find<RepoDoc>("repos", { autopilotWeekly: true });
  for (const repo of repos) {
    rep.checked++;
    const why = (r: string) => { rep.skipped[repo.fullName] = r; };
    if (!repo.accountId) { why("unclaimed"); continue; }
    if (repo.archived) { why("archived"); continue; }
    if (repo.quietMode) { why("quiet_mode"); continue; }
    const tz = validTimezone(repo.timezone);
    if (!isAutopilotWindow(now, tz)) { why("outside_window"); continue; }
    const week = weekKey(now, tz);
    const state = await getState(db, repo.id);
    if (state?.lastWeekKey === week) { why("already_ran_this_week"); continue; }
    if (!isSubscriber(await db.getEntitlement(repo.accountId))) { why("plan_required"); continue; }
    const app = (await db.docs.find<AppRow>("apps", { repoId: repo.id })).find((a) => a.supported && a.laravelMajor);
    if (!app?.laravelMajor) { why("no_supported_app"); continue; }
    try {
      const { run, created } = await startRun(d, { accountId: repo.accountId, repo: { id: repo.id, installationId: repo.installationId, fullName: repo.fullName, defaultBranch: repo.defaultBranch, private: repo.private }, appPath: app.path, hopFrom: app.laravelMajor, hopTo: app.laravelMajor, kind: "autopilot", idempotencyKey: `autopilot:${repo.id}:${week}` });
      await putState(db, repo.id, { fullName: repo.fullName, lastWeekKey: week, ...(state ? {} : { prNumber: null, prOpen: false, closedStreak: 0, quietSuggested: false, lastRunId: null, lastRunAt: null }) });
      if (created) { await dispatchRun(d, run.id); rep.started.push(repo.fullName); } else why("already_started");
    } catch (e) {
      why(e instanceof RunError ? e.code : "error");
      if (!(e instanceof RunError)) log.error("autopilot_failed", { route: "cron/autopilot", message: (e as Error).message });
    }
  }
  return rep;
}

export async function autopilotSummary(db: Db, repoId: string) { return getState(db, repoId); }
