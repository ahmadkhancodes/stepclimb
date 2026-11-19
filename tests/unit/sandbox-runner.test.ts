import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runAgent } from "@/lib/runs/agent";
import type { RunnerEvent } from "@/lib/runs/events";
import { createFixtureHost } from "@/lib/runs/fixture-host";
import { parseHandback, publishHandback, safePath, type Handback } from "@/lib/runs/handback";
import { createDiskEnv, type Exec } from "@/lib/runs/sandbox/disk-env";
import { composerLockDiff, npmLockDiff } from "@/lib/runs/sandbox/lockdiff";
import { runnerPhpSatisfies } from "@/lib/runs/sandbox/php";
import { AGENT_DIR, VercelSandboxRunner, type SandboxDriver } from "@/lib/runs/sandbox-runner";
import type { RunSpec } from "@/lib/runs/runner";

const lock = (pkgs: Record<string, string>) => JSON.stringify({ packages: Object.entries(pkgs).map(([name, version]) => ({ name, version })) });
const npmLock = (pkgs: Record<string, string>) => JSON.stringify({ packages: { "": {}, ...Object.fromEntries(Object.entries(pkgs).map(([n, v]) => [`node_modules/${n}`, { version: v }])) } });

describe("lockfile diff", () => {
  it("lists moved composer packages only, sorted, ignoring new and removed ones", () => {
    const d = composerLockDiff(lock({ "b/b": "1.0.0", "a/a": "v2.1.0", "gone/x": "1.0.0" }), lock({ "a/a": "v2.2.0", "b/b": "1.0.0", "new/y": "1.0.0" }));
    expect(d).toEqual([{ ecosystem: "composer", name: "a/a", from: "2.1.0", to: "2.2.0" }]);
  });
  it("reads top level npm packages only and survives garbage", () => {
    const d = npmLockDiff(npmLock({ vite: "5.0.0", "vite/node_modules/esbuild": "1.0.0" }), npmLock({ vite: "5.4.1", "vite/node_modules/esbuild": "2.0.0" }));
    expect(d).toEqual([{ ecosystem: "npm", name: "vite", from: "5.0.0", to: "5.4.1" }]);
    expect(composerLockDiff("not json", undefined)).toEqual([]);
  });
});

describe("runner PHP", () => {
  it.each([["^8.2", true], ["^8.1|^8.2", true], ["8.2.*", false], [">=8.2 <8.4", true], ["~8.1.0", false], ["^7.4", false], [undefined, true], ["weird @@", true]] as const)("%s -> %s", (c, ok) => expect(runnerPhpSatisfies(c as string | undefined)).toBe(ok));
});

describe("handback validation", () => {
  const base = { baseSha: "a".repeat(40), commits: [{ message: "m", files: [{ path: "composer.lock", mode: "100644", contentBase64: "e30=" }] }] };
  it("accepts a normal handback", () => expect(parseHandback(JSON.stringify(base)).commits).toHaveLength(1));
  it.each(["../x", "/etc/passwd", ".git/hooks/pre-push", "a/.git/config", ".github/workflows/ci.yml", "a//b", "a\\b"])("refuses path %s", (p) => {
    expect(safePath(p)).toBe(false);
    expect(() => parseHandback(JSON.stringify({ ...base, commits: [{ message: "m", files: [{ path: p, mode: "100644", contentBase64: "" }] }] }))).toThrow();
  });
  it("refuses a bad base sha and an empty handback", () => {
    expect(() => parseHandback(JSON.stringify({ ...base, baseSha: "main" }))).toThrow();
    expect(() => parseHandback(JSON.stringify({ ...base, commits: [] }))).toThrow();
  });
});

describe("publishHandback", () => {
  const hb: Handback = { baseSha: "b".repeat(40), commits: [{ message: "one", files: [{ path: "composer.lock", mode: "100644", contentBase64: "AA==" }, { path: "old.txt", deleted: true }] }, { message: "two", files: [{ path: "package-lock.json", mode: "100755", contentBase64: "AQ==" }] }] };
  it("builds the commits on the base and creates the branch", async () => {
    const host = createFixtureHost();
    const head = await publishHandback(host, "a/b", hb, { branch: "stepclimb/laravel-12-abcd1234", baseBranch: "main", force: false });
    expect(host.calls.commits.map((c) => c.message)).toEqual(["one", "two"]);
    expect(host.calls.commits[0]!.parentSha).toBe(hb.baseSha);
    expect(host.calls.commits[1]!.parentSha).toBe(host.calls.commits[0]!.sha);
    expect(host.calls.branches).toEqual([{ fullName: "a/b", branch: "stepclimb/laravel-12-abcd1234", sha: head }]);
  });
  it("never writes the base branch or a non stepclimb branch, and never overwrites without force", async () => {
    const host = createFixtureHost();
    await expect(publishHandback(host, "a/b", hb, { branch: "main", baseBranch: "main", force: true })).rejects.toThrow("unexpected_branch");
    await expect(publishHandback(host, "a/b", hb, { branch: "feature/x", baseBranch: "main", force: true })).rejects.toThrow("unexpected_branch");
    await host.createBranch("a/b", "stepclimb/autopilot", "old");
    await expect(publishHandback(host, "a/b", hb, { branch: "stepclimb/autopilot", baseBranch: "main", force: false })).rejects.toThrow("branch_exists");
    const head = await publishHandback(host, "a/b", hb, { branch: "stepclimb/autopilot", baseBranch: "main", force: true });
    expect(await host.branchHead("a/b", "stepclimb/autopilot")).toBe(head);
  });
});

/** A fake machine: `exec` rewrites lockfiles the way composer and npm would. */
function repoDir(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), "sc-repo-"));
  for (const [p, c] of Object.entries(files)) { mkdirSync(join(root, p, ".."), { recursive: true }); writeFileSync(join(root, p), c); }
  return root;
}
const LARAVEL = { "composer.json": JSON.stringify({ require: { php: "^8.2", "laravel/framework": "^12.0" }, "require-dev": { "phpunit/phpunit": "^11" } }), "composer.lock": lock({ "laravel/framework": "v12.1.0", "monolog/monolog": "3.0.0" }), "package.json": JSON.stringify({ devDependencies: { vite: "^5" } }), "package-lock.json": npmLock({ vite: "5.0.0" }), "tests/ExampleTest.php": "<?php" };

describe("disk run env (autopilot dependency update)", () => {
  it("runs the update inside the constraints as the customer user, commits the lockfiles and hands them back", async () => {
    const root = repoDir(LARAVEL);
    const calls: { cmd: string; who: string; env?: Record<string, string> }[] = [];
    const exec: Exec = async (cmd, o) => {
      calls.push({ cmd, who: o.who, ...(o.env ? { env: o.env } : {}) });
      if (cmd.startsWith("composer update")) writeFileSync(join(o.cwd, "composer.lock"), lock({ "laravel/framework": "v12.4.0", "monolog/monolog": "3.0.0" }));
      if (cmd.startsWith("npm update")) writeFileSync(join(o.cwd, "package-lock.json"), npmLock({ vite: "5.4.1" }));
      return { code: 0, output: "ok" };
    };
    const events: RunnerEvent[] = [];
    let handback: Handback | undefined;
    const env = createDiskEnv({ root, appPath: "", mode: "deps", baseSha: "c".repeat(40), exec, emit: (e) => { events.push(e); }, now: Date.now, deadlineAt: Date.now() + 600_000, writeHandback: (h) => { handback = h; } });
    const out = await runAgent({ runId: "run1", appPath: "", hopFrom: 12, hopTo: 12, extendedVerify: false, deadlineAt: Date.now() + 600_000, recipes: [], rules: [], mode: "deps", branch: "stepclimb/autopilot" }, env);
    expect(out.updates).toEqual([{ ecosystem: "composer", name: "laravel/framework", from: "12.1.0", to: "12.4.0" }, { ecosystem: "npm", name: "vite", from: "5.0.0", to: "5.4.1" }]);
    const cmds = calls.map((c) => c.cmd);
    expect(cmds[0]).toBe("composer update --no-scripts --no-interaction --no-progress --prefer-dist");
    expect(cmds[1]).toBe("npm update --ignore-scripts --no-audit --no-fund --no-progress");
    expect(calls.every((c) => c.who === "customer")).toBe(true);
    expect(JSON.stringify(calls)).not.toMatch(/EVENT_SECRET|gitToken/i);
    expect(calls.some((c) => c.cmd.includes("phpunit") && c.env?.DB_CONNECTION === "sqlite")).toBe(true);
    expect(events.find((e) => e.type === "pushed")).toMatchObject({ type: "pushed", branch: "stepclimb/autopilot" });
    expect(handback!.baseSha).toBe("c".repeat(40));
    expect(handback!.commits).toHaveLength(1);
    expect(handback!.commits[0]!.message).toBe("Stepclimb autopilot: update 2 dependencies");
    expect(handback!.commits[0]!.files.map((f) => f.path).sort()).toEqual(["composer.lock", "package-lock.json"]);
    const l = handback!.commits[0]!.files.find((f) => f.path === "composer.lock") as { contentBase64: string };
    expect(Buffer.from(l.contentBase64, "base64").toString()).toContain("12.4.0");
    expect(readFileSync(join(root, "composer.json"), "utf8")).toContain("laravel/framework"); // untouched files stay
  });
  it("moves nothing: no commit, no handback, no push", async () => {
    const root = repoDir(LARAVEL);
    let pushed = false;
    const env = createDiskEnv({ root, appPath: "", mode: "deps", baseSha: "c".repeat(40), exec: async () => ({ code: 0, output: "Nothing to update" }), emit: (e) => { if (e.type === "pushed") pushed = true; }, now: Date.now, deadlineAt: Date.now() + 600_000, writeHandback: () => { throw new Error("no handback expected"); } });
    const out = await runAgent({ runId: "run2", appPath: "", hopFrom: 12, hopTo: 12, extendedVerify: false, deadlineAt: Date.now() + 600_000, recipes: [], rules: [], mode: "deps", branch: "stepclimb/autopilot" }, env);
    expect(out.updates).toEqual([]);
    expect(pushed).toBe(false);
  });
  it("a failing composer update aborts the run with a clear reason and never pushes", async () => {
    const root = repoDir(LARAVEL);
    const events: RunnerEvent[] = [];
    const env = createDiskEnv({ root, appPath: "", mode: "deps", baseSha: "c".repeat(40), exec: async () => ({ code: 2, output: "Your requirements could not be resolved" }), emit: (e) => { events.push(e); }, now: Date.now, deadlineAt: Date.now() + 600_000, writeHandback: () => { throw new Error("no handback expected"); } });
    const out = await runAgent({ runId: "run3", appPath: "", hopFrom: 12, hopTo: 12, extendedVerify: false, deadlineAt: Date.now() + 600_000, recipes: [], rules: [], mode: "deps", branch: "stepclimb/autopilot" }, env);
    expect(out.aborted).toBe("composer_update_failed");
  });
});

describe("sandbox runner wiring", () => {
  const spec: RunSpec = { runId: "r1", fullName: "a/b", baseBranch: "main", appPath: "", hopFrom: 12, hopTo: 12, extendedVerify: false, deadlineAt: Date.now() + 1_500_000, eventSecret: "evsecret", callbackUrl: "https://stepclimb.test/api/runner/events", gitToken: "ghs_SECRETTOKEN", mode: "deps", branch: "stepclimb/autopilot" };
  it("uploads the agent, starts it with the autopilot mode and reads the handback back; the git token only reaches the platform rules", async () => {
    const uploaded: string[] = [];
    const ran: { cmd: string[]; env: Record<string, string> }[] = [];
    let created: Parameters<SandboxDriver["create"]>[0] | undefined;
    const driver: SandboxDriver = {
      create: async (o) => { created = o; return { id: "sbx_9" }; },
      writeFiles: async (_id, files) => { uploaded.push(...files.map((f) => f.path)); },
      runDetached: async (_id, cmd, env) => { ran.push({ cmd, env }); },
      readFile: async (_id, path) => (path.endsWith("handback.json") ? Buffer.from("{}") : null),
      stop: async () => undefined,
      list: async () => [],
    };
    const r = new VercelSandboxRunner({ driver, payload: async () => [{ path: `${AGENT_DIR}/agent.mjs`, content: "//" }] });
    await r.start(spec, async () => undefined);
    expect(uploaded).toEqual([`${AGENT_DIR}/agent.mjs`]);
    expect(ran[0]!.cmd).toEqual(["node", `${AGENT_DIR}/agent.mjs`]);
    expect(ran[0]!.env).toMatchObject({ MODE: "deps", BRANCH: "stepclimb/autopilot", STEPCLIMB_AGENT_AUTORUN: "1", SANDBOX_ID: "sbx_9" });
    expect(JSON.stringify(ran)).not.toContain("ghs_SECRETTOKEN");
    expect(created!.injectionRules.map((x) => x.host)).toEqual(["github.com", "api.github.com"]);
    expect(await r.collect({ backend: "vercel-sandbox", id: "sbx_9" })).toBe("{}");
  });
});

// ───────── service: a backend that hands commits back instead of pushing ─────────
import { createMemoryDb } from "@/lib/db/memory";
import { signEvent, type SignedEvent } from "@/lib/runs/events";
import type { DeliverEvent, RunnerBackend, RunnerHandle } from "@/lib/runs/runner";
import { dispatchRun, startRun, type RunDeps } from "@/lib/runs/service";
import { getRun as getRunForTest } from "@/lib/runs/store";

describe("finalize with a collecting backend (D-35)", () => {
  const sub = { isPaid: true, status: "active" as const, plan: "solo" as const, interval: "year" as const, quantity: 5, expiresAt: null, trialStartedAt: null, cancelAtPeriodEnd: false, checkedAt: 0, trialUsed: false, subscriptionId: "sub_1", lifetimePaymentIntentId: null, pastDueSince: null };
  const repo = { id: "9001:acme/app", installationId: "9001", fullName: "acme/app", defaultBranch: "main", private: true };
  function backend(handback: string | null): RunnerBackend {
    return {
      name: "collecting",
      async start(spec: RunSpec, deliver: DeliverEvent): Promise<RunnerHandle> {
        let seq = 0;
        const send = async (event: SignedEvent["event"]) => { const e = { seq: ++seq, event }; await deliver(e, await signEvent(spec.eventSecret, spec.runId, e)); };
        await send({ type: "started", sandboxId: "sbx" });
        await send({ type: "pushed", branch: "stepclimb/autopilot", headSha: "handback" });
        await send({ type: "result", result: { verified: true, hasTests: true, recipes: [], repair: { passes: 0, rulesApplied: [], unmatchedSignatures: [], stopReason: "passed" }, verification: { composer: true, build: null, tests: true }, squawks: [], computeSeconds: 5, changedFileCount: 1, updates: [{ ecosystem: "composer", name: "laravel/framework", from: "12.1.0", to: "12.4.0" }] } });
        return { backend: "collecting", id: "sbx" };
      },
      async cancel() { /* stopped */ },
      async collect() { return handback; },
      async listActive() { return []; },
    };
  }
  async function run(handback: string | null) {
    const db = createMemoryDb("stepclimb");
    await db.setEntitlement("org_1", sub);
    const host = createFixtureHost();
    const deps: RunDeps = { db, runner: backend(handback), host: async () => host, gitToken: async () => "tok", appUrl: "https://stepclimb.test" };
    const { run: r } = await startRun(deps, { accountId: "org_1", repo, hopFrom: 12, hopTo: 12, kind: "autopilot" });
    await dispatchRun(deps, r.id);
    return { host, run: await getRunForTest(db, r.id) };
  }
  it("publishes the handed back commits to stepclimb/autopilot (forced) and opens the PR from them", async () => {
    const hb: Handback = { baseSha: "d".repeat(40), commits: [{ message: "Stepclimb autopilot: update 1 dependency", files: [{ path: "composer.lock", mode: "100644", contentBase64: "AA==" }] }] };
    const { host, run: r } = await run(JSON.stringify(hb));
    expect(r!.status).toBe("succeeded");
    expect(host.calls.commits.map((c) => c.message)).toEqual(["Stepclimb autopilot: update 1 dependency"]);
    expect(host.calls.commits[0]!.parentSha).toBe("d".repeat(40));
    expect(host.calls.prs[0]).toMatchObject({ head: "stepclimb/autopilot", base: "main" });
    expect(host.calls.checks[0]!.headSha).toBe(host.calls.commits[0]!.sha); // the head GitHub reports for our branch
  });
  it("fails the run, opens no PR, when the sandbox left no handback or a hostile one", async () => {
    for (const raw of [null, JSON.stringify({ baseSha: "d".repeat(40), commits: [{ message: "x", files: [{ path: ".git/config", mode: "100644", contentBase64: "" }] }] })]) {
      const { host, run: r } = await run(raw);
      expect(r!.status).toBe("failed");
      expect(host.calls.prs).toHaveLength(0);
      expect(host.calls.commits).toHaveLength(0);
    }
  });
});
