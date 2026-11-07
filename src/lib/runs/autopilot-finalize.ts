import { getState, putState, recordPrClosed } from "@/lib/autopilot/state";
import { weekKey, validTimezone } from "@/lib/autopilot/schedule";
import type { Db } from "@/lib/db";
import { mailWeeklyPr } from "@/lib/mail/notify";
import type { DepUpdate, RunResult } from "./events";
import type { GitHost } from "./git-host";
import { transition } from "./store";
import type { RunDoc } from "./types";
import { checkOutput, conclusionFor, stampFor, workOrderNo } from "./work-order";

/** The one branch autopilot keeps up to date; refreshing pushes here instead of opening a second PR. */
export const AUTOPILOT_BRANCH = "stepclimb/autopilot";

type RunWithId = RunDoc & { id: string };
interface Deps { db: Db; host: (run: RunWithId) => Promise<GitHost>; appUrl: string; now?: () => Date }

export function autopilotBody(i: { runId: string; fullName: string; updates: DepUpdate[]; result: RunResult; appUrl: string; weekLabel: string }): string {
  const stamp = stampFor(i.result);
  const rows = i.updates.map((u) => `| ${u.ecosystem} | \`${u.name}\` | ${u.from} | ${u.to} |`);
  return [
    `# Weekly dependency update · ${i.weekLabel}`,
    `> **${stamp}** · Stepclimb by BufferSol autopilot · ${i.fullName}`,
    "",
    `${i.updates.length} dependenc${i.updates.length === 1 ? "y" : "ies"} moved within their version constraints. Nothing here changes a major version: those are work orders.`,
    "",
    "| Ecosystem | Package | From | To |", "|---|---|---|---|", ...rows,
    "",
    "## Verification",
    `Composer ${i.result.verification.composer ? "passed" : "failed"}, build ${i.result.verification.build === null ? "not run" : i.result.verification.build ? "passed" : "failed"}, tests ${i.result.hasTests ? (i.result.verification.tests ? "passed" : "failed") : "no test suite (Unverified)"}.${i.result.repair.passes ? ` The repair pass made ${i.result.repair.passes} fix commit${i.result.repair.passes === 1 ? "" : "s"}.` : ""}`,
    "",
    "This PR is refreshed each week while it stays open, so you get one PR, not a pile. Close it to skip a week.",
    `---\n[Work order ${workOrderNo(i.runId)}](${i.appUrl}/app/work-orders/${i.runId})`,
  ].join("\n");
}

/**
 * Autopilot finalize: nothing moved means no PR. Otherwise refresh the open autopilot PR (same branch, new body and check)
 * or open one. A PR found closed meanwhile counts toward the quiet mode suggestion and a new PR is opened.
 */
export async function finalizeAutopilot(d: Deps, run: RunWithId, result: RunResult): Promise<RunDoc & { id: string }> {
  const now = (d.now ?? (() => new Date()))();
  const updates = result.updates ?? [];
  const state = await getState(d.db, run.repoId);
  if (updates.length === 0) {
    await putState(d.db, run.repoId, { fullName: run.fullName, lastRunId: run.id, lastRunAt: now, ...(state ? {} : { prNumber: null, prOpen: false, closedStreak: 0, quietSuggested: false, lastWeekKey: null }) });
    return (await transition(d.db, run.id, "succeeded", { verified: null, checkConclusion: null }, now)) as RunWithId;
  }
  const host = await d.host(run);
  const weekLabel = weekKey(now, validTimezone(null));
  const body = autopilotBody({ runId: run.id, fullName: run.fullName, updates, result, appUrl: d.appUrl, weekLabel });
  const title = `Weekly dependency update · ${run.fullName} · ${weekLabel}`;
  let number = state?.prNumber ?? null;
  let url = "";
  let refreshed = false;
  if (number && state?.prOpen) {
    const st = await host.prState(run.fullName, number);
    if (st === "open" || st === "unknown") {
      await host.updatePr(run.fullName, number, { title, body });
      url = `https://github.com/${run.fullName}/pull/${number}`;
      refreshed = true;
    } else await recordPrClosed(d.db, run.repoId, st === "merged");
  }
  if (!refreshed) {
    const pr = await host.openPr(run.fullName, { head: run.branch ?? AUTOPILOT_BRANCH, base: run.baseBranch, title, body, draft: false });
    number = pr.number;
    url = pr.url;
  }
  const head = run.headSha ?? (await host.branchHead(run.fullName, run.branch ?? AUTOPILOT_BRANCH)) ?? "";
  const conclusion = conclusionFor(result);
  const out = checkOutput({ runId: run.id, fullName: run.fullName, hopFrom: run.hopFrom, hopTo: run.hopTo, result, appUrl: d.appUrl });
  await host.createCheckRun(run.fullName, { headSha: head, conclusion, title: out.title, summary: `Weekly dependency update: ${updates.length} moved. ${out.summary}`, text: body });
  const prev = await getState(d.db, run.repoId);
  await putState(d.db, run.repoId, { fullName: run.fullName, prNumber: number, prOpen: true, lastRunId: run.id, lastRunAt: now, closedStreak: prev?.closedStreak ?? 0, quietSuggested: prev?.quietSuggested ?? false, lastWeekKey: prev?.lastWeekKey ?? weekLabel });
  const done = await transition(d.db, run.id, "succeeded", { prNumber: number!, prUrl: url, prDraft: false, checkConclusion: conclusion }, now);
  await mailWeeklyPr(d.db, run.accountId, { fullName: run.fullName, weekLabel, updateCount: updates.length, stamp: stampFor(result), prUrl: url, refreshed });
  return done as RunWithId;
}
