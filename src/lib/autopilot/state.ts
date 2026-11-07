import type { Db } from "@/lib/db";

/** Per repo autopilot state (`autopilot_state`, id = repo doc id). One open PR at a time, refreshed weekly. */
export interface AutopilotState {
  repoId: string;
  fullName: string;
  /** last ISO week a run was started for */
  lastWeekKey: string | null;
  prNumber: number | null;
  prOpen: boolean;
  /** unmerged closes in a row; 3 suggests quiet mode (never forced) */
  closedStreak: number;
  quietSuggested: boolean;
  lastRunId: string | null;
  lastRunAt: Date | null;
}

export const QUIET_AFTER_CLOSED = 3;

export const getState = (db: Db, repoId: string) => db.docs.get<AutopilotState>("autopilot_state", repoId);
export const putState = (db: Db, repoId: string, patch: Partial<AutopilotState>) => db.docs.put("autopilot_state", repoId, { repoId, ...patch } as Record<string, unknown>);

/** A PR we opened was closed: merged resets the streak, an unmerged close counts toward the quiet mode suggestion. */
export async function recordPrClosed(db: Db, repoId: string, merged: boolean): Promise<AutopilotState | null> {
  const s = await getState(db, repoId);
  if (!s) return null;
  const streak = merged ? 0 : s.closedStreak + 1;
  const next = { prOpen: false, closedStreak: streak, quietSuggested: streak >= QUIET_AFTER_CLOSED };
  await putState(db, repoId, next);
  return { ...s, ...next };
}

/** `pull_request` webhook: closing our autopilot PR (matched by repo and number) updates the state. */
export async function handlePullRequestEvent(db: Db, p: { action?: string; number?: number; pull_request?: { merged?: boolean; number?: number }; repository?: { full_name?: string } }): Promise<boolean> {
  if (p.action !== "closed") return false;
  const number = p.number ?? p.pull_request?.number;
  const fullName = p.repository?.full_name;
  if (!number || !fullName) return false;
  const [s] = (await db.docs.find<AutopilotState>("autopilot_state", { fullName, prNumber: number, prOpen: true }, { limit: 1 }));
  if (!s) return false;
  await recordPrClosed(db, s.repoId, !!p.pull_request?.merged);
  return true;
}
