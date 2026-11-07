// Pre-launch review (docs/REVIEW.md): one regression test per P0, written to fail on the code before the fix.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createMemoryDb } from "@/lib/db/memory";
import type { Db } from "@/lib/db";
import { loadRecipes } from "@/lib/engine/recipes";
import { loadRules } from "@/lib/engine/repair";
import { applyGithubEvent, claimInstallations } from "@/lib/github/sync";
import { FIXTURE_INSTALLATION_ID, FIXTURE_REPOS, fixtureInstallationPayload } from "@/lib/github/fixtures";
import { signEvent, type RunResult } from "@/lib/runs/events";
import { FakeRunner } from "@/lib/runs/fake-runner";
import { createFixtureHost } from "@/lib/runs/fixture-host";
import { RUN_TOKEN_PERMISSIONS } from "@/lib/runs/git-host";
import { dispatchRun, finalizeRun, ingestEvent, startRun, type RunDeps } from "@/lib/runs/service";
import { simulatedVerify } from "@/lib/runs/simulated-verify";
import { availableCredit, consumeCredit, getRun, grantCredit, listLogs, appendLog, transition, purgeOldLogs } from "@/lib/runs/store";
import { buildWorkOrderBody, reviewComments, sanitizeResult } from "@/lib/runs/work-order";

const recipes = loadRecipes(join(process.cwd(), "recipes"));
const rules = loadRules(join(process.cwd(), "repair-rules"));
const ACCOUNT = "org_1";
const portal = FIXTURE_REPOS.find((r) => r.fullName.endsWith("/billing-portal"))!;
const repo = { id: "9001:kestrel-digital/billing-portal", installationId: "9001", fullName: "kestrel-digital/billing-portal", defaultBranch: "main" };

function setup(hang = true) {
  const db: Db = createMemoryDb("stepclimb");
  const host = createFixtureHost();
  const runner = new FakeRunner({ host, hang, repo: portal.files, recipes, rules, verify: (s, fs) => simulatedVerify(s, fs) });
  const deps: RunDeps = { db, runner, host: async () => host, gitToken: async () => "tok", appUrl: "https://stepclimb.test" };
  return { db, host, runner, deps };
}
async function started(s: ReturnType<typeof setup>) {
  await grantCredit(s.db, ACCOUNT, "to_previous", null);
  const { run } = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 });
  await dispatchRun(s.deps, run.id);
  return (await getRun(s.db, run.id))!;
}
const send = async (s: ReturnType<typeof setup>, run: { id: string; eventSecret: string }, seq: number, event: unknown) => {
  const e = { seq, event: event as never };
  return ingestEvent(s.deps, run.id, e, await signEvent(run.eventSecret, run.id, e));
};
/** the PR body outside code fences (fenced text renders literally: no mentions, no HTML) */
const prose = (md: string) => md.replace(/^\s*(`{3,})[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, "");
const result = (over: Partial<RunResult> = {}): RunResult => ({
  verified: true, hasTests: true, recipes: [], repair: { passes: 0, rulesApplied: [], unmatchedSignatures: [], stopReason: "passed" },
  verification: { composer: true, build: null, tests: true }, squawks: [], computeSeconds: 1, changedFileCount: 0, ...over,
});

describe("P0-2 the sandbox cannot choose the branch or the commit the check lands on", () => {
  it("a push report for the default branch is refused: no PR, run failed, credit back", async () => {
    const s = setup();
    const run = await started(s);
    expect(await send(s, run, 1, { type: "started", sandboxId: "fake-1" })).toBe("ok");
    await send(s, run, 2, { type: "pushed", branch: "main", headSha: "abc" });
    await send(s, run, 3, { type: "result", result: result() });
    const r = (await getRun(s.db, run.id))!;
    expect(r.status).toBe("failed");
    expect(r.branch).toBeNull();
    expect(s.host.calls.prs).toHaveLength(0);
    expect(s.host.calls.checks).toHaveLength(0);
    expect(await availableCredit(s.db, ACCOUNT, "to_previous")).not.toBeNull();
  });
  it("the Verified check goes on the head GitHub reports for our branch, never on a sha the sandbox names", async () => {
    const s = setup();
    const run = await started(s);
    const branch = `stepclimb/laravel-12-${run.id.slice(-8)}`;
    await s.host.moveBranch(repo.fullName, branch, "realhead1");
    await send(s, run, 1, { type: "started", sandboxId: "fake-1" });
    await send(s, run, 2, { type: "pushed", branch, headSha: "a1b2c3defaultbranchcommit" });
    await send(s, run, 3, { type: "result", result: result() });
    expect(s.host.calls.checks[0]!.headSha).toBe("realhead1");
    expect(s.host.calls.prs[0]).toMatchObject({ head: branch, base: "main" });
  });
  it("a result without a pushed branch opens no PR", async () => {
    const s = setup();
    const run = await started(s);
    await send(s, run, 1, { type: "started", sandboxId: "fake-1" });
    await send(s, run, 2, { type: "result", result: result() });
    expect(s.host.calls.prs).toHaveLength(0);
    expect((await getRun(s.db, run.id))!.status).toBe("failed");
  });
  it("malformed events are refused, not half applied", async () => {
    const s = setup();
    const run = await started(s);
    expect(await send(s, run, 1, { type: "log_chunk", stream: "stdout", text: { evil: true } })).toBe("invalid");
    expect(await send(s, run, 2, { type: "result", result: { verified: "yes" } })).toBe("invalid");
    expect(await listLogs(s.db, run.id)).toHaveLength(0);
  });
  it("the token handed to the sandbox cannot write", () => {
    expect(Object.values(RUN_TOKEN_PERMISSIONS)).not.toContain("write");
  });
});

describe("P0-3 untrusted text never reaches the PR as live markdown", () => {
  const hostile = result({
    verified: false,
    repair: { passes: 1, rulesApplied: ["rule](https://evil.example)"], unmatchedSignatures: [], stopReason: "x" },
    squawks: [{
      severity: "must_fix", file: "../../etc/passwd", line: 3, title: "@octocat please look <img src=https://evil.example/p.png>",
      bodyMd: "Ping @everyone and @org/team\n[click me](https://evil.example/login) ![x](https://evil.example/t.png)\n<details><summary>x</summary></details>\n```\ninside fence @safe <b>ok</b>\n```\ntoken ghp_abcdefghijklmnopqrstuvwxyz0123456789",
      agentPrompt: "close the fence ```\n# Injected heading @octocat",
    }],
  });
  it("sanitizes mentions, HTML, images, off host links, paths, secrets and fence break outs", () => {
    const safe = sanitizeResult(hostile);
    const body = buildWorkOrderBody({ runId: "0190abcd-0000-7000-8000-000000000001", fullName: "a/b", hopFrom: 11, hopTo: 12, result: safe, appUrl: "https://stepclimb.test" });
    expect(prose(body)).not.toMatch(/@octocat|@everyone|@org\/team/);
    expect(prose(body)).not.toContain("# Injected");
    expect(body).not.toContain("<img");
    expect(body).not.toContain("](https://evil.example");
    expect(body).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    expect(body).not.toContain("../../etc/passwd");
    expect(body).toContain("inside fence @safe <b>ok</b>"); // code stays readable inside fences
    expect(body).toContain("````text"); // a longer fence than the backticks inside the prompt
    expect(body.match(/<details>/g)).toHaveLength(1); // only ours
    expect(reviewComments(safe)).toHaveLength(0); // no line comment on a path outside the repo
  });
  it("finalize stores and posts only the sanitized result", async () => {
    const s = setup();
    const run = await started(s);
    const branch = `stepclimb/laravel-12-${run.id.slice(-8)}`;
    await s.host.moveBranch(repo.fullName, branch, "h1");
    await transition(s.db, run.id, "running");
    const { patchRun } = await import("@/lib/runs/store");
    await patchRun(s.db, run.id, { branch });
    await finalizeRun(s.deps, run.id, hostile);
    expect(prose(s.host.calls.prs[0]!.body)).not.toMatch(/@octocat|@everyone/);
    expect(s.host.calls.prs[0]!.body).not.toContain("<img");
  });
});

describe("P0-1 an installation is linked only with proof the user can see it on GitHub", () => {
  it("a guessed fresh installation id does not hand a stranger's repos to another account", async () => {
    const db = createMemoryDb("stepclimb");
    await applyGithubEvent(db, "installation", fixtureInstallationPayload());
    expect(await claimInstallations(db, "attacker-org", { installationId: FIXTURE_INSTALLATION_ID, githubLogin: "attacker" })).toEqual([]);
    expect(await claimInstallations(db, "attacker-org", { installationId: FIXTURE_INSTALLATION_ID, githubLogin: null })).toEqual([]);
    expect((await db.docs.get<{ accountId: string | null }>("installations", FIXTURE_INSTALLATION_ID))!.accountId).toBeNull();
  });
});

describe("P0-4 every admin page checks the founder itself", () => {
  const pages = ["src/app/admin/page.tsx", "src/app/admin/runs/page.tsx", "src/app/admin/runs/[id]/page.tsx", "src/app/admin/rules/page.tsx"];
  it.each(pages)("%s calls requireFounderPage before reading data", (p) => {
    const src = readFileSync(join(process.cwd(), p), "utf8");
    const body = src.slice(src.indexOf("export default async function"));
    expect(body.split("\n").slice(1, 3).join("\n")).toMatch(/await requireFounderPage\(/);
  });
});

describe("P1 credits and retention", () => {
  it("two parallel starts cannot spend the same credit", async () => {
    const db = createMemoryDb("stepclimb");
    await grantCredit(db, ACCOUNT, "to_previous", null);
    const got = await Promise.all([consumeCredit(db, ACCOUNT, "to_previous"), consumeCredit(db, ACCOUNT, "to_previous"), consumeCredit(db, ACCOUNT, "to_previous")]);
    expect(got.filter(Boolean)).toHaveLength(1);
  });
  it("a refunded credit can be spent again", async () => {
    const db = createMemoryDb("stepclimb");
    await grantCredit(db, ACCOUNT, "to_previous", null);
    const id = (await consumeCredit(db, ACCOUNT, "to_previous"))!;
    const { refundCredit } = await import("@/lib/runs/store");
    await refundCredit(db, id);
    expect(await consumeCredit(db, ACCOUNT, "to_previous")).toBe(id);
  });
  it("run logs are deleted 30 days after the run ends", async () => {
    const s = setup();
    const run = await started(s);
    await appendLog(s.db, run.id, "stdout", "hello");
    await transition(s.db, run.id, "canceled", {}, new Date(Date.now() - 31 * 86_400_000));
    expect(await purgeOldLogs(s.db)).toEqual({ runs: 1 });
    expect(await listLogs(s.db, run.id)).toHaveLength(0);
  });
});
