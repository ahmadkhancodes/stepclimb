import type { Db } from "@/lib/db";
import { LATEST_LARAVEL_MAJOR } from "@/lib/engine/detect";
import { redactSecrets } from "@/lib/engine/repair";
import { audit } from "@/lib/audit";
import { getFlags } from "@/lib/flags";
import { mailRunFailed, mailRunFinished } from "@/lib/mail/notify";
import { isRepoDenied } from "@/lib/security/denylist";
import { finalizeAutopilot } from "./autopilot-finalize";
import { checkFreeTier, freeTierMessage } from "./free-tier";
import { loadPins } from "./pins";
import type { RunResult, RunnerEvent, SignedEvent } from "./events";
import { verifyEvent } from "./events";
import { AUTOPILOT_BRANCH } from "./autopilot-finalize";
import { creditKindFor } from "./credit-kind";
import type { GitHost } from "./git-host";
import type { RunnerBackend } from "./runner";
import { addStep, appendLog, consumeCredit, createRun, getRun, patchRun, refundCredit, saveSquawks, transition } from "./store";
import { LIMITS, isTerminal, type RunDoc } from "./types";
import { buildWorkOrderBody, checkOutput, conclusionFor, prTitle, reviewComments, stampFor, workOrderNo } from "./work-order";

type RunWithId = RunDoc & { id: string };

export interface RunDeps {
  db: Db;
  runner: RunnerBackend;
  host: (run: RunWithId) => Promise<GitHost>;
  /** repo scoped token handed to the sandbox for clone and push */
  gitToken: (run: RunWithId) => Promise<string>;
  appUrl: string;
  now?: () => Date;
}
const nowOf = (d: RunDeps) => (d.now ?? (() => new Date()))();

export class RunError extends Error {
  constructor(readonly code: string, readonly status = 400, readonly extra: Record<string, unknown> = {}) { super(code); }
}

export { creditKindFor };

const SUBSCRIPTION_PLANS = ["solo", "legacy_solo", "studio", "legacy_studio", "agency"];
export const isSubscriber = (ent: { isPaid: boolean; plan: string } | null | undefined) => !!ent?.isPaid && SUBSCRIPTION_PLANS.includes(ent.plan);

export interface StartInput {
  accountId: string;
  repo: { id: string; installationId: string; fullName: string; defaultBranch: string; private?: boolean };
  /** branch the work starts from (catch up stacks each hop on the previous PR branch); default is the repo default branch */
  baseBranch?: string;
  /** catch up: keep going hop by hop until this Laravel major */
  chainTo?: number;
  /** GitHub account creation date of the owner, for the free tier */
  githubCreatedAt?: Date | null;
  appPath?: string;
  hopFrom: number;
  hopTo: number;
  extendedVerify?: boolean;
  idempotencyKey?: string | null;
  kind?: RunDoc["kind"];
}

/** Plan check, credit reservation, concurrency guard. Throws RunError(402, ...) with the credit kind when payment is needed. */
export async function startRun(d: RunDeps, i: StartInput): Promise<{ run: RunWithId; created: boolean }> {
  const { db } = d;
  const kind = i.kind ?? "upgrade";
  if (kind === "upgrade" && (i.hopTo !== i.hopFrom + 1 || i.hopTo > LATEST_LARAVEL_MAJOR || i.hopFrom < 10)) throw new RunError("bad_hop");
  if (i.chainTo !== undefined && (kind !== "upgrade" || i.chainTo < i.hopTo || i.chainTo > LATEST_LARAVEL_MAJOR)) throw new RunError("bad_hop");
  if (i.idempotencyKey) {
    const [hit] = await db.docs.find<RunDoc>("runs", { accountId: i.accountId, idempotencyKey: i.idempotencyKey }, { limit: 1 });
    if (hit) return { run: hit, created: false };
  }
  if (isRepoDenied(i.repo.fullName)) throw new RunError("repo_denied", 403);
  if (kind === "upgrade") {
    const flags = await getFlags(db);
    if (flags[`path_laravel_${i.hopFrom}_to_${i.hopTo}`] === "off") throw new RunError("path_disabled", 503);
  }
  const open = (await db.docs.find<RunDoc>("runs", { accountId: i.accountId })).filter((r) => !isTerminal(r.status));
  if (open.some((r) => r.repoId === i.repo.id && r.hopTo === i.hopTo && r.appPath === (i.appPath ?? "") && r.kind === kind)) throw new RunError("run_already_open", 409);
  if (open.length >= LIMITS.perAccountConcurrency) throw new RunError("too_many_runs", 429);
  if ((await db.docs.find<RunDoc>("runs")).filter((r) => !isTerminal(r.status)).length >= LIMITS.globalConcurrency) throw new RunError("busy", 503);

  const ent = await db.getEntitlement(i.accountId);
  const covered = !!ent?.isPaid && SUBSCRIPTION_PLANS.includes(ent.plan);
  const creditKind = creditKindFor(i.hopTo);
  let billing: RunDoc["billing"] = { via: "plan", creditId: null, creditKind: null };
  if (kind === "autopilot") {
    if (!covered) throw new RunError("plan_required", 402);
  } else if (!covered && kind !== "noop") {
    const creditId = await consumeCredit(db, i.accountId, creditKind, nowOf(d));
    if (creditId) billing = { via: "credit", creditId, creditKind };
    else {
      // free tier: the first PR a month on a public repo, GitHub account 30 days or older
      const free = await checkFreeTier(db, { accountId: i.accountId, repoPrivate: i.repo.private ?? true, githubCreatedAt: i.githubCreatedAt ?? null, now: nowOf(d) });
      if (!free.ok) throw new RunError("payment_required", 402, { creditKind, freeTier: { reason: free.reason, message: freeTierMessage(free.reason) } });
      billing = { via: "free", creditId: null, creditKind: null };
    }
  }
  if (i.extendedVerify) {
    const ext = await consumeCredit(db, i.accountId, "extended_verify", nowOf(d));
    if (!ext && !(ent?.isPaid && ent.plan !== "solo")) {
      if (billing.creditId) await refundCredit(db, billing.creditId);
      throw new RunError("payment_required", 402, { creditKind: "extended_verify" });
    }
  }
  const { run, created } = await createRun(db, { accountId: i.accountId, repoId: i.repo.id, installationId: i.repo.installationId, fullName: i.repo.fullName, baseBranch: i.baseBranch ?? i.repo.defaultBranch, ...(i.appPath !== undefined ? { appPath: i.appPath } : {}), hopFrom: i.hopFrom, hopTo: i.hopTo, kind, billing, idempotencyKey: i.idempotencyKey ?? null, extendedVerify: !!i.extendedVerify, now: nowOf(d) });
  if (i.chainTo !== undefined && i.chainTo > i.hopTo) await patchRun(db, run.id, { chainTo: i.chainTo });
  await audit({ orgId: i.accountId, actorId: null, action: "run.created", target: run.id }).catch(() => undefined);
  return { run: { ...run, ...(i.chainTo !== undefined && i.chainTo > i.hopTo ? { chainTo: i.chainTo } : {}) }, created };
}

/** Moves queued -> starting -> running by handing the spec to the backend. A failed start refunds the credit. */
export async function dispatchRun(d: RunDeps, runId: string, callbackUrl = `${d.appUrl}/api/runner/events`): Promise<RunWithId> {
  const run = await getRun(d.db, runId);
  if (!run) throw new RunError("not_found", 404);
  if (run.status !== "queued") return run;
  const now = nowOf(d);
  const wall = run.extendedVerify ? LIMITS.extendedWallClockMs : LIMITS.wallClockMs;
  await transition(d.db, runId, "starting", { startedAt: now, deadlineAt: now.getTime() + wall, leaseUntil: now.getTime() + 60_000 }, now);
  try {
    if (run.kind === "noop") {
      await openNoopPr(d, { ...run, status: "starting" });
      return (await getRun(d.db, runId))!;
    }
    const pins = await loadPins(d.db);
    const spec = { runId, ...(run.kind === "autopilot" ? { mode: "deps" as const, branch: AUTOPILOT_BRANCH } : {}), pins, fullName: run.fullName, baseBranch: run.baseBranch, appPath: run.appPath, hopFrom: run.hopFrom, hopTo: run.hopTo, extendedVerify: run.extendedVerify, deadlineAt: now.getTime() + wall, eventSecret: run.eventSecret, callbackUrl, gitToken: await d.gitToken(run) };
    const handle = await d.runner.start(spec, (e, sig) => ingestEvent(d, runId, e, sig).then(() => undefined));
    await patchRun(d.db, runId, { sandboxId: handle.id });
  } catch (e) {
    await failRun(d, runId, e instanceof Error ? e.message : "start_failed", "failed");
  }
  return (await getRun(d.db, runId))!;
}

async function failRun(d: RunDeps, runId: string, error: string, to: "failed" | "timed_out" | "canceled", extra: Partial<RunDoc> = {}) {
  const run = await getRun(d.db, runId);
  if (!run || isTerminal(run.status)) return;
  if (run.sandboxId) await d.runner.cancel({ backend: d.runner.name, id: run.sandboxId }).catch(() => undefined);
  const giveBack = !!run.billing.creditId && !run.branch; // nothing delivered, nothing charged
  if (giveBack) await refundCredit(d.db, run.billing.creditId!);
  const failed = await transition(d.db, runId, to, { error: redactSecrets(error), ...(giveBack ? { creditRefunded: true } : {}), ...extra }, nowOf(d));
  if (run.kind === "upgrade" && to !== "canceled") {
    await mailRunFailed(d.db, run.accountId, { workOrderNo: workOrderNo(runId), fullName: run.fullName, hopTo: run.hopTo, runUrl: `${d.appUrl}/app/work-orders/${runId}`, detail: `Laravel ${run.hopFrom} to ${run.hopTo} on ${run.fullName}.`, reason: friendlyReason(failed.error ?? error), credited: !!(run.billing.creditId && !run.branch) });
  }
}

const friendlyReason = (e: string) => e.replace(/^app_is_on_(\w+)_not_(\d+)$/, "the app is on Laravel $1, not $2").replace(/_/g, " ");

/** Verifies and applies one runner event. Returns false for replays and bad signatures (never throws on those). */
export async function ingestEvent(d: RunDeps, runId: string, e: SignedEvent, signature: string | null): Promise<"ok" | "bad_signature" | "replay" | "not_found" | "closed"> {
  const run = await getRun(d.db, runId);
  if (!run) return "not_found";
  if (!(await verifyEvent(run.eventSecret, runId, e, signature))) return "bad_signature";
  if (isTerminal(run.status)) return "closed";
  if (!Number.isInteger(e.seq) || e.seq <= run.lastSeq) return "replay";
  await patchRun(d.db, runId, { lastSeq: e.seq });
  await applyEvent(d, run, e.event);
  return "ok";
}

async function applyEvent(d: RunDeps, run: RunWithId, ev: RunnerEvent) {
  const now = nowOf(d);
  switch (ev.type) {
    case "started":
      if (run.status === "starting" || run.status === "queued") await transition(d.db, run.id, "running", { sandboxId: ev.sandboxId }, now);
      return;
    case "step":
      await addStep(d.db, run.id, { name: ev.name, status: ev.status, ...(ev.detail ? { detail: redactSecrets(ev.detail) } : {}), ...(ev.durationMs !== undefined ? { durationMs: ev.durationMs } : {}) });
      return;
    case "log_chunk":
      await appendLog(d.db, run.id, ev.stream, redactSecrets(ev.text));
      return;
    case "pushed":
      await patchRun(d.db, run.id, { branch: ev.branch, headSha: ev.headSha });
      return;
    case "result":
      await finalizeRun(d, run.id, ev.result);
  }
}

/** Orchestrator side of a run: PR, squawk comments, check run, status. The sandbox is destroyed in `finally`. */
export async function finalizeRun(d: RunDeps, runId: string, result: RunResult): Promise<RunWithId> {
  let run = (await getRun(d.db, runId))!;
  if (isTerminal(run.status)) return run;
  try {
    if (run.status === "starting") run = (await transition(d.db, runId, "running")) as RunWithId;
    run = (await transition(d.db, runId, "finalizing", { repairPasses: result.repair.passes, repairRulesApplied: result.repair.rulesApplied, computeSeconds: result.computeSeconds, verified: result.verified })) as RunWithId;
    await saveSquawks(d.db, runId, result.squawks);
    // unmatched failure signatures feed the weekly review (docs/ARCHITECTURE.md P0-7)
    for (const sig of result.repair.unmatchedSignatures) {
      const prev = await d.db.docs.get<{ count: number }>("unmatched_signatures", sig);
      await d.db.docs.put("unmatched_signatures", sig, { signature: sig, count: (prev?.count ?? 0) + 1, firstSeen: prev ? undefined : nowOf(d), lastSeen: nowOf(d) });
    }
    if (result.aborted && !run.branch) {
      await failRun(d, runId, result.aborted, "failed");
      return (await getRun(d.db, runId))!;
    }
    if (run.kind === "autopilot") return (await finalizeAutopilot(d, run, result)) as RunWithId;
    const host = await d.host(run);
    const input = { runId, fullName: run.fullName, hopFrom: run.hopFrom, hopTo: run.hopTo, result, appUrl: d.appUrl };
    const draft = !!result.timedOut;
    const pr = await host.openPr(run.fullName, { head: run.branch!, base: run.baseBranch, title: prTitle(run.fullName, run.hopTo, runId, result) + (draft ? " (timed out)" : ""), body: buildWorkOrderBody(input), draft });
    const conclusion = conclusionFor(result);
    const out = checkOutput(input);
    const head = run.headSha ?? (await host.branchHead(run.fullName, run.branch!)) ?? "";
    await host.createCheckRun(run.fullName, { headSha: head, conclusion, ...out });
    const comments = reviewComments(result);
    if (comments.length > 0) await host.postReview(run.fullName, pr.number, { headSha: head, body: `Stepclimb squawks: ${comments.length} on exact lines.`, comments });
    const done = await transition(d.db, runId, result.timedOut ? "timed_out" : "succeeded", { prNumber: pr.number, prUrl: pr.url, prDraft: draft, checkConclusion: conclusion, error: result.timedOut ? "wall_clock" : null });
    await mailRunFinished(d.db, run.accountId, { workOrderNo: workOrderNo(runId), fullName: run.fullName, hopTo: run.hopTo, stamp: stampFor(result), prUrl: pr.url, runUrl: `${d.appUrl}/app/work-orders/${runId}`, detail: `${result.recipes.filter((x) => !x.noop).length} recipes changed ${result.changedFileCount} files. ${result.verified ? "Composer, build and tests passed." : result.hasTests ? "Verification did not pass: read the squawks." : "No test suite was found, so review the PR before merging."}` });
    if (!result.timedOut) await continueChain(d, done as RunWithId);
    return done as RunWithId;
  } catch (e) {
    await failRun(d, runId, e instanceof Error ? e.message : "finalize_failed", "failed");
    return (await getRun(d.db, runId))!;
  } finally {
    const r = await getRun(d.db, runId);
    if (r?.sandboxId) await d.runner.cancel({ backend: d.runner.name, id: r.sandboxId }).catch(() => undefined);
  }
}

/** Catch up: a verified hop starts the next one on top of its branch (stacked PRs) until `chainTo`. Stops, and says why, on any problem. */
async function continueChain(d: RunDeps, run: RunWithId): Promise<void> {
  if (!run.chainTo || run.chainTo <= run.hopTo || !run.branch) return;
  try {
    const next = await startRun(d, { accountId: run.accountId, repo: { id: run.repoId, installationId: run.installationId, fullName: run.fullName, defaultBranch: run.baseBranch }, baseBranch: run.branch, appPath: run.appPath, hopFrom: run.hopTo, hopTo: run.hopTo + 1, chainTo: run.chainTo, idempotencyKey: `chain:${run.id}`, extendedVerify: run.extendedVerify });
    if (next.created) await dispatchRun(d, next.run.id);
  } catch (e) {
    const why = e instanceof RunError ? e.code : e instanceof Error ? e.message : "chain_failed";
    await patchRun(d.db, run.id, { chainStopped: why });
    await audit({ orgId: run.accountId, actorId: null, action: "run.chain_stopped", target: run.id, meta: { reason: why } }).catch(() => undefined);
  }
}

/** The no-op PR: branch, empty commit, PR, check run, with no sandbox. Proves the GitHub App write path end to end. */
export async function openNoopPr(d: RunDeps, run: RunWithId): Promise<void> {
  const host = await d.host(run);
  const base = await host.getBase(run.fullName, run.baseBranch);
  const branch = `stepclimb/noop-${run.id.slice(-8)}`;
  await host.createBranch(run.fullName, branch, base.commitSha);
  const sha = await host.createCommit(run.fullName, { message: "Stepclimb: no-op work order (no files changed)", treeSha: base.treeSha, parentSha: base.commitSha });
  await host.moveBranch(run.fullName, branch, sha);
  const result: RunResult = { verified: false, hasTests: false, recipes: [], repair: { passes: 0, rulesApplied: [], unmatchedSignatures: [], stopReason: "not_run" }, verification: { composer: true, build: null, tests: null }, squawks: [{ severity: "note", title: "No-op work order", bodyMd: "This work order changed nothing. It checks that Stepclimb can open a PR and a check run on this repo.", agentPrompt: "Nothing to do: you can close this PR." }], computeSeconds: 0, changedFileCount: 0 };
  const input = { runId: run.id, fullName: run.fullName, hopFrom: run.hopFrom, hopTo: run.hopTo, result, appUrl: d.appUrl };
  const pr = await host.openPr(run.fullName, { head: branch, base: run.baseBranch, title: prTitle(run.fullName, run.hopTo, run.id, result), body: buildWorkOrderBody(input), draft: true });
  await host.createCheckRun(run.fullName, { headSha: sha, conclusion: "neutral", ...checkOutput(input) });
  await patchRun(d.db, run.id, { branch, headSha: sha, prNumber: pr.number, prUrl: pr.url, prDraft: true, checkConclusion: "neutral", verified: false });
  await transition(d.db, run.id, "running");
  await transition(d.db, run.id, "finalizing");
  await transition(d.db, run.id, "succeeded");
}

export async function cancelRun(d: RunDeps, runId: string): Promise<void> {
  await failRun(d, runId, "canceled_by_user", "canceled");
}

export interface ReapReport { timedOut: string[]; stalled: string[]; leaked: string[]; redispatched: string[] }

/** Watchdog (cron, every minute): enforces the wall clock, stops stalled runs, stops leaked sandboxes, re-queues stuck leases. */
export async function reapRuns(d: RunDeps): Promise<ReapReport> {
  const now = nowOf(d).getTime();
  const rep: ReapReport = { timedOut: [], stalled: [], leaked: [], redispatched: [] };
  const all = await d.db.docs.find<RunDoc>("runs");
  for (const r of all.filter((x) => !isTerminal(x.status))) {
    if (r.status === "queued") {
      if (now - new Date(r.createdAt).getTime() > 60_000) { await dispatchRun(d, r.id); rep.redispatched.push(r.id); }
      continue;
    }
    if (r.deadlineAt !== null && now > r.deadlineAt) {
      rep.timedOut.push(r.id);
      if (r.branch) {
        // a draft PR "timed out" from what was pushed
        const partial: RunResult = { verified: false, hasTests: false, recipes: [], repair: { passes: r.repairPasses, rulesApplied: r.repairRulesApplied, unmatchedSignatures: [], stopReason: "timed_out" }, verification: { composer: false, build: null, tests: null }, squawks: [{ severity: "must_fix", title: "Run timed out", bodyMd: "The run hit its wall clock limit and was stopped. The branch holds what had been pushed.", agentPrompt: "Check out this branch, run `composer update` and the test suite, and finish the upgrade from the Laravel upgrade guide." }], computeSeconds: r.computeSeconds, changedFileCount: 0, timedOut: true };
        await finalizeRun(d, r.id, partial);
      } else await failRun(d, r.id, "wall_clock", "timed_out");
      continue;
    }
    if (r.status === "running" && now - new Date(r.updatedAt).getTime() > LIMITS.silenceMs) {
      rep.stalled.push(r.id);
      await failRun(d, r.id, "stalled_no_output", "failed");
    }
  }
  const live = new Set((await d.db.docs.find<RunDoc>("runs")).filter((x) => !isTerminal(x.status) && x.sandboxId).map((x) => x.sandboxId!));
  for (const h of await d.runner.listActive()) {
    if (!live.has(h.id)) { await d.runner.cancel(h); rep.leaked.push(h.id); }
  }
  return rep;
}

export { stampFor };
