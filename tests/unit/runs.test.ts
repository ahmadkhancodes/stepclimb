import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryDb } from "@/lib/db/memory";
import type { Db } from "@/lib/db";
import { loadRecipes } from "@/lib/engine/recipes";
import { loadRules, runRepairLoop } from "@/lib/engine/repair";
import { MemoryFs } from "@/lib/engine/vfs";
import { signEvent, verifyEvent, type RunResult } from "@/lib/runs/events";
import { FakeRunner, type FakeRunnerOptions } from "@/lib/runs/fake-runner";
import { createFixtureHost } from "@/lib/runs/fixture-host";
import type { RunSpec } from "@/lib/runs/runner";
import { VercelSandboxRunner, type SandboxDriver } from "@/lib/runs/sandbox-runner";
import { cancelRun, creditKindFor, dispatchRun, finalizeRun, ingestEvent, reapRuns, startRun, type RunDeps, RunError } from "@/lib/runs/service";
import { simulatedVerify } from "@/lib/runs/simulated-verify";
import { availableCredit, consumeCredit, getRun, grantCredit, listLogs, listSquawks, listSteps, patchRun, transition, RunStateError } from "@/lib/runs/store";
import { EGRESS_ALLOW, EGRESS_DENY_AI, LIMITS, TRANSITIONS, RUN_STATUSES } from "@/lib/runs/types";
import { buildWorkOrderBody, checkOutput, conclusionFor, reviewComments, stampFor, workOrderNo } from "@/lib/runs/work-order";
import { FIXTURE_REPOS } from "@/lib/github/fixtures";
import { buildCorpus } from "./fixtures/corpus";

const recipes = loadRecipes(join(process.cwd(), "recipes"));
const rules = loadRules(join(process.cwd(), "repair-rules"));
const ACCOUNT = "org_1";
const portal = FIXTURE_REPOS.find((r) => r.fullName.endsWith("/billing-portal"))!;
const repo = { id: "9001:kestrel-digital/billing-portal", installationId: "9001", fullName: "kestrel-digital/billing-portal", defaultBranch: "main" };

function setup(opts: Partial<FakeRunnerOptions> = {}, files: Record<string, string> = portal.files) {
  const db: Db = createMemoryDb("stepclimb");
  const runner = new FakeRunner({ repo: files, recipes, rules, verify: (s, fs) => simulatedVerify(s, fs), ...opts });
  const host = createFixtureHost();
  const t = { now: Date.now() };
  const deps: RunDeps = { db, runner, host: async () => host, gitToken: async () => "tok", appUrl: "https://stepclimb.test", now: () => new Date(t.now) };
  return { db, runner, host, deps, t };
}
const go = async (s: ReturnType<typeof setup>, over: Partial<Parameters<typeof startRun>[1]> = {}) => {
  await grantCredit(s.db, ACCOUNT, "to_previous", null);
  const { run } = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12, ...over });
  await dispatchRun(s.deps, run.id);
  return (await getRun(s.db, run.id))!;
};

describe("run state machine", () => {
  it("only allows declared transitions and keeps terminal states final", async () => {
    const s = setup();
    const { run } = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12, kind: "noop" });
    await expect(transition(s.db, run.id, "succeeded")).rejects.toBeInstanceOf(RunStateError);
    await transition(s.db, run.id, "starting");
    await transition(s.db, run.id, "running");
    await transition(s.db, run.id, "failed", { error: "x" });
    await expect(transition(s.db, run.id, "running")).rejects.toThrow(/illegal_transition_failed_to_running/);
    for (const st of RUN_STATUSES) expect(Array.isArray(TRANSITIONS[st])).toBe(true);
    expect(TRANSITIONS.succeeded).toEqual([]);
  });
});

describe("start, billing and limits", () => {
  it("maps hops to the existing credit kinds", () => {
    expect([creditKindFor(13), creditKindFor(12), creditKindFor(11)]).toEqual(["to_latest", "to_previous", "older_hop"]);
  });
  it("answers payment_required with the kind to buy, takes nothing", async () => {
    const s = setup();
    await expect(startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 12, hopTo: 13 })).rejects.toMatchObject({ code: "payment_required", status: 402, extra: { creditKind: "to_latest" } });
    expect(await s.db.docs.find("runs")).toHaveLength(0);
  });
  it("consumes one credit and is idempotent per key", async () => {
    const s = setup();
    await grantCredit(s.db, ACCOUNT, "to_previous", "cs_1");
    expect(await grantCredit(s.db, ACCOUNT, "to_previous", "cs_1")).toBe(false); // same Checkout session twice
    const a = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12, idempotencyKey: "k1" });
    const b = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12, idempotencyKey: "k1" });
    expect(b.created).toBe(false);
    expect(b.run.id).toBe(a.run.id);
    expect(await availableCredit(s.db, ACCOUNT, "to_previous")).toBeNull();
  });
  it("an active plan needs no credit", async () => {
    const s = setup();
    await s.db.setEntitlement(ACCOUNT, { isPaid: true, status: "active", plan: "studio", interval: "year", expiresAt: null, trialStartedAt: null, cancelAtPeriodEnd: false, checkedAt: 0, trialUsed: false, subscriptionId: "s", lifetimePaymentIntentId: null, pastDueSince: null });
    const { run } = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 });
    expect(run.billing.via).toBe("plan");
  });
  it("expired credits do not count", async () => {
    const s = setup();
    await grantCredit(s.db, ACCOUNT, "to_previous", null, new Date(Date.now() - (LIMITS.creditTtlDays + 1) * 86_400_000));
    expect(await consumeCredit(s.db, ACCOUNT, "to_previous")).toBeNull();
  });
  it("rejects a second open run for the same hop, caps concurrency and bad hops", async () => {
    const s = setup();
    await grantCredit(s.db, ACCOUNT, "to_previous", null);
    await grantCredit(s.db, ACCOUNT, "to_previous", null);
    await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 });
    await expect(startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 })).rejects.toMatchObject({ code: "run_already_open", status: 409 });
    await expect(startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 14 })).rejects.toMatchObject({ code: "bad_hop" });
    await expect(startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 9, hopTo: 10 })).rejects.toBeInstanceOf(RunError);
    for (let i = 0; i < 2; i++) await patchRun(s.db, (await s.db.docs.find("runs"))[0]!.id, {});
    await startRun(s.deps, { accountId: ACCOUNT, repo: { ...repo, id: "r2" }, hopFrom: 11, hopTo: 12, kind: "noop" });
    await expect(startRun(s.deps, { accountId: ACCOUNT, repo: { ...repo, id: "r3" }, hopFrom: 11, hopTo: 12, kind: "noop" })).rejects.toMatchObject({ code: "too_many_runs", status: 429 });
  });
});

describe("runner events", () => {
  it("rejects bad signatures and replays, accepts in order", async () => {
    const s = setup({ hang: true });
    const { run } = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12, kind: "noop" });
    const ev = { seq: 1, event: { type: "log_chunk" as const, stream: "stdout" as const, text: "hello" } };
    expect(await verifyEvent(run.eventSecret, run.id, ev, "deadbeef")).toBe(false);
    expect(await ingestEvent(s.deps, run.id, ev, "deadbeef")).toBe("bad_signature");
    const sig = await signEvent(run.eventSecret, run.id, ev);
    expect(await ingestEvent(s.deps, run.id, ev, sig)).toBe("ok");
    expect(await ingestEvent(s.deps, run.id, ev, sig)).toBe("replay");
    expect(await ingestEvent(s.deps, "nope", ev, sig)).toBe("not_found");
    // a signature for another run's secret is useless
    const other = { seq: 2, event: ev.event };
    expect(await ingestEvent(s.deps, run.id, other, await signEvent("other-secret", run.id, other))).toBe("bad_signature");
    expect((await listLogs(s.db, run.id)).map((l) => l.text)).toEqual(["hello"]);
  });
});

describe("end to end with the fake runner", () => {
  let s: ReturnType<typeof setup>;
  beforeEach(() => { s = setup(); });

  it("11 to 12 on the fixture app: branch, commits, PR, check run, squawks, steps", async () => {
    const run = await go(s);
    expect(run.status).toBe("succeeded");
    expect(run.verified).toBe(true);
    expect(run.checkConclusion).toBe("success");
    expect(run.branch).toMatch(/^stepclimb\/laravel-12-/);
    expect(s.runner.pushed[0]!.branch).toBe(run.branch);
    expect(s.runner.commits[0]!.message).toMatch(/^Stepclimb: laravel-11-to-12\./);
    const pkgs = JSON.parse(s.runner.pushed[0]!.fs["composer.json"]!) as { require: Record<string, string> };
    expect(pkgs.require["laravel/framework"]).toBe("^12.0");
    expect(s.host.calls.prs).toHaveLength(1);
    expect(s.host.calls.prs[0]).toMatchObject({ head: run.branch, base: "main", draft: false });
    expect(s.host.calls.prs[0]!.title).toMatch(/^Work order #\d{4} · kestrel-digital\/billing-portal to Laravel 12 · Verified$/);
    expect(s.host.calls.checks[0]).toMatchObject({ conclusion: "success" });
    expect((await listSteps(s.db, run.id)).map((x) => x.name)).toEqual(expect.arrayContaining(["detect", "verify:composer", "verify:tests"]));
    expect(run.prUrl).toContain("/pull/1");
    expect(await availableCredit(s.db, ACCOUNT, "to_previous")).toBeNull(); // delivered: charged
  });

  it("the repair pass fixes a stale package and commits it as `Repair:`", async () => {
    const files = { "composer.json": JSON.stringify({ require: { php: "^8.2", "laravel/framework": "^10.0", "laravel/horizon": "^5.0" }, "require-dev": { "phpunit/phpunit": "^10.1" } }, null, 2), "composer.lock": JSON.stringify({ packages: [{ name: "laravel/framework", version: "v10.48.0" }] }) };
    s = setup({}, files);
    await grantCredit(s.db, ACCOUNT, "older_hop", null);
    const { run: started } = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 10, hopTo: 11 });
    await dispatchRun(s.deps, started.id);
    const run = (await getRun(s.db, started.id))!;
    expect(run.repairPasses).toBeGreaterThan(0);
    expect(run.repairRulesApplied).toContain("composer.horizon-5");
    expect(s.runner.commits.some((c) => c.message.startsWith("Repair: "))).toBe(true);
    expect(run.checkConclusion).toBe("success");
    expect(run.billing.creditKind).toBe("older_hop");
  });

  it("a repo without tests is Unverified: neutral check, amber stamp", async () => {
    const files = { ...portal.files, "composer.json": JSON.stringify({ require: { php: "^8.2", "laravel/framework": "^11.0" } }) };
    s = setup({}, files);
    const run = await go(s);
    expect(run.status).toBe("succeeded");
    expect(run.checkConclusion).toBe("neutral");
    expect(s.host.calls.prs[0]!.title).toMatch(/Unverified$/);
    expect(s.host.calls.prs[0]!.body).toContain("**Unverified**");
  });

  it("a failure no rule matches ends the loop, records the signature and posts a failure check with squawks", async () => {
    s = setup({ verify: (stage, fs) => (stage === "tests" ? { passed: false, stage, output: "FAILED Tests\\Feature\\ExampleTest\nat tests/Feature/ExampleTest.php:12\nSomething odd" } : simulatedVerify(stage, fs)) });
    const run = await go(s);
    expect(run.status).toBe("succeeded"); // PR delivered
    expect(run.checkConclusion).toBe("failure");
    expect(run.verified).toBe(false);
    expect((await s.db.docs.find("unmatched_signatures")).length).toBe(1);
    const sq = await listSquawks(s.db, run.id);
    expect(sq.length).toBeGreaterThan(0);
    expect(sq[0]!.agentPrompt.length).toBeGreaterThan(20);
  });

  it("the repair loop stops after 3 passes", async () => {
    let n = 0;
    s = setup({ verify: (stage, fs) => (stage === "tests" ? { passed: false, stage, output: `Root composer.json requires laravel/sanctum ^3.${++n}` } : simulatedVerify(stage, fs)) });
    const run = await go(s);
    expect(run.repairPasses).toBeLessThanOrEqual(LIMITS.repairLoops);
  });

  it("redacts secrets in logs before storing them", async () => {
    s = setup({ verify: (stage, fs) => (stage === "tests" ? { passed: true, stage, output: "ok token ghp_abcdefghijklmnopqrstuvwxyz0123456789 done" } : simulatedVerify(stage, fs)) });
    const run = await go(s);
    const text = (await listLogs(s.db, run.id)).map((l) => l.text).join("\n");
    expect(text).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
  });

  it("an unsupported app fails the run, opens no PR and refunds the credit", async () => {
    s = setup({}, { "composer.json": JSON.stringify({ require: { php: "^8.2", "laravel/framework": "^8.0" } }) });
    const run = await go(s);
    expect(run.status).toBe("failed");
    expect(s.host.calls.prs).toHaveLength(0);
    expect(await availableCredit(s.db, ACCOUNT, "to_previous")).not.toBeNull();
  });

  it("a failed sandbox start fails the run and refunds", async () => {
    s = setup({ failStart: true });
    const run = await go(s);
    expect(run.status).toBe("failed");
    expect(run.error).toBe("sandbox_create_failed");
    expect(await availableCredit(s.db, ACCOUNT, "to_previous")).not.toBeNull();
  });

  it("the agent watchdog opens a draft PR marked timed out with the recipes applied so far", async () => {
    s = setup({ tickMs: 400_000 });
    const run = await go(s);
    expect(run.status).toBe("timed_out");
    expect(run.prDraft).toBe(true);
    expect(s.host.calls.prs[0]!.draft).toBe(true);
    expect(s.host.calls.prs[0]!.title).toContain("(timed out)");
    expect(run.checkConclusion).toBe("neutral");
  });

  it("leaves nothing behind: no sandbox alive, the next run starts from a clean repo", async () => {
    const before = JSON.stringify(portal.files);
    await go(s);
    expect(await s.runner.listActive()).toEqual([]);
    expect(s.runner.stopped.length).toBe(1);
    expect(JSON.stringify(portal.files)).toBe(before);
    await patchRun(s.db, (await s.db.docs.find("runs"))[0]!.id, {});
    await grantCredit(s.db, ACCOUNT, "to_previous", null);
    const again = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 });
    await dispatchRun(s.deps, again.run.id);
    // the second run saw the original manifest, not the first run's changes
    expect(JSON.parse(s.runner.pushed[1]!.fs["composer.json"]!).require["laravel/framework"]).toBe("^12.0");
    expect(s.runner.commits.filter((c) => c.message.startsWith("Stepclimb: laravel-11-to-12.composer")).length).toBe(2);
  });

  it("cancel stops the sandbox and refunds when nothing was delivered", async () => {
    s = setup({ hang: true });
    await grantCredit(s.db, ACCOUNT, "to_previous", null);
    const { run } = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 });
    await dispatchRun(s.deps, run.id);
    expect((await getRun(s.db, run.id))!.status).toBe("starting");
    await cancelRun(s.deps, run.id);
    expect((await getRun(s.db, run.id))!.status).toBe("canceled");
    expect(await availableCredit(s.db, ACCOUNT, "to_previous")).not.toBeNull();
  });
});

describe("watchdog", () => {
  it("stops a run past 25 minutes, refunds, and stops leaked sandboxes", async () => {
    const s = setup({ hang: true });
    await grantCredit(s.db, ACCOUNT, "to_previous", null);
    const { run } = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 });
    await dispatchRun(s.deps, run.id);
    await s.runner.start({ runId: "ghost" } as RunSpec, async () => undefined); // a sandbox no run owns
    s.t.now += LIMITS.wallClockMs + 1000;
    const rep = await reapRuns(s.deps);
    expect(rep.timedOut).toEqual([run.id]);
    expect(rep.leaked).toHaveLength(1);
    expect((await getRun(s.db, run.id))!.status).toBe("timed_out");
    expect(await s.runner.listActive()).toEqual([]);
    expect(await availableCredit(s.db, ACCOUNT, "to_previous")).not.toBeNull();
  });
  it("opens a draft PR when a branch was already pushed", async () => {
    const s = setup({ hang: true });
    await grantCredit(s.db, ACCOUNT, "to_previous", null);
    const { run } = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 });
    await dispatchRun(s.deps, run.id);
    await patchRun(s.db, run.id, { branch: "stepclimb/laravel-12-abc", headSha: "sha1" });
    s.t.now += LIMITS.wallClockMs + 1000;
    await reapRuns(s.deps);
    const r = (await getRun(s.db, run.id))!;
    expect(r.status).toBe("timed_out");
    expect(s.host.calls.prs[0]).toMatchObject({ draft: true, head: "stepclimb/laravel-12-abc" });
  });
  it("fails a running sandbox that went silent", async () => {
    const s = setup({ hang: true });
    await grantCredit(s.db, ACCOUNT, "to_previous", null);
    const { run } = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 });
    await dispatchRun(s.deps, run.id);
    await transition(s.db, run.id, "running");
    await s.db.docs.put("runs", run.id, { updatedAt: new Date(s.t.now - LIMITS.silenceMs - 1000) });
    const rep = await reapRuns(s.deps);
    expect(rep.stalled).toEqual([run.id]);
  });
  it("re-dispatches a run stuck in the queue", async () => {
    const s = setup();
    await grantCredit(s.db, ACCOUNT, "to_previous", null);
    const { run } = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 });
    s.t.now += 120_000;
    expect((await reapRuns(s.deps)).redispatched).toEqual([run.id]);
    expect((await getRun(s.db, run.id))!.status).toBe("succeeded");
  });
  it("the extended verify limit is longer and allows 5 repair loops", () => {
    expect(LIMITS.extendedWallClockMs).toBe(60 * 60_000);
    expect(LIMITS.wallClockMs).toBe(25 * 60_000);
    expect(LIMITS.extendedRepairLoops).toBe(5);
    expect(LIMITS.memoryGb).toBe(8);
  });
});

describe("no op PR end to end", () => {
  it("branch, empty commit on the base tree, draft PR, neutral check run", async () => {
    const s = setup();
    const { run } = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12, kind: "noop" });
    await dispatchRun(s.deps, run.id);
    const r = (await getRun(s.db, run.id))!;
    expect(r.status).toBe("succeeded");
    expect(s.host.calls.branches[0]!.branch).toMatch(/^stepclimb\/noop-/);
    expect(s.host.calls.commits[0]).toMatchObject({ treeSha: "basetree0001", parentSha: "basecommit0001" });
    expect(s.host.calls.prs[0]!.draft).toBe(true);
    expect(s.host.calls.checks[0]).toMatchObject({ conclusion: "neutral" });
    expect(r.billing.via).toBe("plan"); // a no-op takes no credit
  });
});

describe("Vercel Sandbox backend", () => {
  it("creates the sandbox with the egress allow list and keeps the git token out of the VM", async () => {
    const created: Parameters<SandboxDriver["create"]>[0][] = [];
    const ran: { cmd: string[]; env: Record<string, string> }[] = [];
    const driver: SandboxDriver = {
      create: async (o) => { created.push(o); return { id: "sbx_1" }; },
      runDetached: async (_id, cmd, env) => { ran.push({ cmd, env }); },
      stop: async () => undefined,
      list: async () => [{ id: "sbx_1", status: "running" }, { id: "sbx_0", status: "stopped" }],
    };
    const r = new VercelSandboxRunner({ driver });
    const spec: RunSpec = { runId: "r1", fullName: "a/b", baseBranch: "main", appPath: "", hopFrom: 11, hopTo: 12, extendedVerify: false, deadlineAt: Date.now() + LIMITS.wallClockMs, eventSecret: "evsecret", callbackUrl: "https://stepclimb.test/api/runner/events", gitToken: "ghs_SECRETTOKEN" };
    const h = await r.start(spec, async () => undefined);
    expect(h).toEqual({ backend: "vercel-sandbox", id: "sbx_1" });
    expect(created[0]!.vcpus).toBe(4);
    expect(created[0]!.networkPolicy.allow).toEqual(expect.arrayContaining([...EGRESS_ALLOW, "stepclimb.test"]));
    expect(created[0]!.timeoutMs).toBeGreaterThan(LIMITS.wallClockMs);
    expect(JSON.stringify(ran)).not.toContain("ghs_SECRETTOKEN"); // only the platform injects it
    expect(created[0]!.injectionRules[0]!.headers.authorization).toMatch(/^Basic /);
    expect(await r.listActive()).toEqual([{ backend: "vercel-sandbox", id: "sbx_1" }]);
  });
  it("never allows an LLM host", () => {
    for (const h of EGRESS_DENY_AI) expect(EGRESS_ALLOW as readonly string[]).not.toContain(h);
  });
});

describe("work order PR body, check run and squawk comments", () => {
  const result: RunResult = {
    verified: true, hasTests: true, recipes: [{ key: "laravel-11-to-12.composer", version: "1.0.0", commitSha: "a", changedFiles: ["composer.json"], noop: false }],
    repair: { passes: 1, rulesApplied: ["composer.sanctum-4"], unmatchedSignatures: [], stopReason: "passed" },
    verification: { composer: true, build: null, tests: true },
    squawks: [{ severity: "note", title: "Check tinker", bodyMd: "body", agentPrompt: "prompt" }, { severity: "must_fix", file: "app/Foo.php", line: 7, title: "Broken", bodyMd: "why", agentPrompt: "fix it" }],
    computeSeconds: 12, changedFileCount: 3,
  };
  const input = { runId: "01HZ", fullName: "a/b", hopFrom: 11, hopTo: 12, result, appUrl: "https://stepclimb.test" };
  it("has stamp, summary, recipes, verification and the squawk index ordered by severity", () => {
    const body = buildWorkOrderBody(input);
    expect(body).toContain(`Work order #${workOrderNo("01HZ")}`);
    for (const h of ["**VERIFIED**", "## Summary", "## Recipes", "## Verification", "## Squawks (2)"]) expect(body).toContain(h);
    expect(body.indexOf("Must fix")).toBeLessThan(body.indexOf("**Note**"));
    expect(body).toContain("composer.sanctum-4");
  });
  it("check conclusion follows the result", () => {
    expect(conclusionFor(result)).toBe("success");
    expect(conclusionFor({ ...result, verified: false, verification: { ...result.verification, tests: false } })).toBe("failure");
    expect(stampFor({ ...result, verified: false, hasTests: false })).toBe("UNVERIFIED");
    expect(conclusionFor({ ...result, verified: false, hasTests: false })).toBe("neutral");
    expect(stampFor({ ...result, timedOut: true })).toBe("TIMED OUT");
    expect(checkOutput(input).title).toBe("Stepclimb by BufferSol · Verified");
  });
  it("comments only on squawks with an exact line", () => {
    expect(reviewComments(result)).toEqual([{ path: "app/Foo.php", line: 7, body: expect.stringContaining("**Must fix**") }]);
  });
  it("finalizeRun is a no-op on a finished run", async () => {
    const s = setup();
    const run = await go(s);
    const again = await finalizeRun(s.deps, run.id, result);
    expect(again.status).toBe("succeeded");
    expect(s.host.calls.prs).toHaveLength(1);
  });
});

describe("repair rules 16 to 30", () => {
  const cases: [string, number, string, string][] = [
    ["composer.horizon-5", 11, "laravel/horizon", "^5.0"], ["composer.scout-10", 11, "laravel/scout", "^9.0"], ["composer.socialite-5", 11, "laravel/socialite", "^4.0"],
    ["composer.jetstream-5", 11, "laravel/jetstream", "^4.0"], ["composer.breeze-2", 11, "laravel/breeze", "^1.0"], ["composer.pint-1", 11, "laravel/pint", "^1.0"],
    ["composer.tinker-2", 11, "laravel/tinker", "^2.5"], ["composer.sail-1", 11, "laravel/sail", "^1.1"], ["composer.spatie-permission-6", 11, "spatie/laravel-permission", "^5.0"],
    ["tests.pest-plugin-laravel-3", 12, "pestphp/pest-plugin-laravel", "^2.4"], ["tests.pest-plugin-laravel-4", 13, "pestphp/pest-plugin-laravel", "^3.0"],
    ["larastan.larastan-3", 11, "larastan/larastan", "^2.0"],
  ];
  it("there are at least 30 rules", () => expect(rules.length).toBeGreaterThanOrEqual(30));
  for (const [key, major, pkg, old] of cases) {
    it(`${key} matches Composer's message and fixes ${pkg}`, async () => {
      const dev = /breeze|pint|sail|pest|larastan/.test(pkg);
      const json = { require: { php: "^8.3", "laravel/framework": `^${major}.0`, ...(dev ? {} : { [pkg]: old }) }, "require-dev": dev ? { [pkg]: old } : {} };
      const fs = new MemoryFs({ "composer.json": JSON.stringify(json, null, 4) });
      const out = await runRepairLoop({ verify: async (f) => simulatedVerify("composer", f), rules, fs, hop: { from: major - 1, to: major } });
      expect(out.appliedRuleKeys).toContain(key);
      expect(out.passed).toBe(true);
    });
  }
  it("composer.laravel-12-php-8-2 and 13-php-8-3 raise the php floor", async () => {
    for (const [major, key, php] of [[12, "composer.laravel-12-php-8-2", "^8.1"], [13, "composer.laravel-13-php-8-3", "^8.2"]] as const) {
      const fs = new MemoryFs({ "composer.json": JSON.stringify({ require: { php, "laravel/framework": `^${major}.0` } }) });
      const out = await runRepairLoop({ verify: async (f) => simulatedVerify("composer", f), rules, fs, hop: { from: major - 1, to: major } });
      expect(out.appliedRuleKeys).toContain(key);
    }
  });
  it("build.laravel-vite-plugin-1 bumps an old plugin in package.json", async () => {
    const fs = new MemoryFs({ "package.json": '{"devDependencies":{"laravel-vite-plugin":"^0.8.0","vite":"^5.0"}}' });
    const out = await runRepairLoop({ verify: async () => ({ passed: fs.read("package.json")!.includes("^1.0.0"), stage: "build", output: "npm ERR! ERESOLVE laravel-vite-plugin peer vite" }), rules, fs, hop: { from: 10, to: 11 } });
    expect(out.passed).toBe(true);
    expect(fs.read("package.json")).toContain('"laravel-vite-plugin":"^1.0.0"');
  });
});

describe("fixture corpus pass rate (simulated verification)", () => {
  const corpus = buildCorpus(20);
  const rate: Record<number, { ok: number; total: number }> = {};
  it("passes at least 75 percent of 20 apps per hop with no human edits", async () => {
    for (const app of corpus) {
      const runner = new FakeRunner({ repo: app.files, recipes, rules, verify: (st, fs) => simulatedVerify(st, fs) });
      let result: RunResult | undefined;
      const spec: RunSpec = { runId: `run-${app.name}`, fullName: "f/x", baseBranch: "main", appPath: "", hopFrom: app.from, hopTo: app.to, extendedVerify: false, deadlineAt: Date.now() + 3_600_000, eventSecret: "s", callbackUrl: "https://x.test/e", gitToken: "t" };
      await runner.start(spec, async (e) => { if (e.event.type === "result") result = e.event.result; });
      const r = (rate[app.from] ??= { ok: 0, total: 0 });
      r.total++;
      // passes = ends verified (tests) or composer and build clean on a repo without tests
      if (result && !result.aborted && !result.timedOut && result.verification.composer && result.verification.tests !== false && (result.verified || !app.hasTests === !result.hasTests)) r.ok++;
    }
    const line = Object.entries(rate).map(([f, r]) => `${f} to ${Number(f) + 1}: ${r.ok}/${r.total}`).join(", ");
    console.info(`fixture pass rate (simulated): ${line}`);
    for (const r of Object.values(rate)) expect(r.ok / r.total).toBeGreaterThanOrEqual(0.75);
  });
});
