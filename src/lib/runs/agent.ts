import { detectApp } from "@/lib/engine/detect";
import { applyRecipe, planHops, type Recipe, type RecipeContext } from "@/lib/engine/recipes";
import { excerptOf, redactSecrets, runRepairLoop, type Rule, type VerifyResult } from "@/lib/engine/repair";
import type { ExternalStep, Squawk } from "@/lib/engine/types";
import type { VirtualFs } from "@/lib/engine/vfs";
import type { DepUpdate, RunnerEvent, RunResult } from "./events";
import { applyPins, type Pins } from "./pins";
import { LIMITS } from "./types";

/**
 * The run agent: what executes inside the sandbox (or, in tests, in the process). It never spawns anything itself:
 * `RunEnv` supplies the repo, the commands and git. That is the seam the fake runner, Vercel Sandbox and the VPS runner share.
 */
export interface RunEnv {
  fs: VirtualFs;
  /** tagged laravel/laravel files for the skeleton three way diff of one hop */
  skeleton?: (hop: { from: number; to: number }) => Promise<RecipeContext["skeleton"]>;
  /** run one verification stage; `composer` includes the lockfile update */
  verifyStage: (stage: "composer" | "build" | "tests" | "larastan", fs: VirtualFs) => Promise<VerifyResult>;
  /** run an engine ExternalStep (rector, php parser, codemod); a failure becomes a log line, not a crash */
  runExternal?: (step: ExternalStep, fs: VirtualFs) => Promise<{ ok: boolean; output: string }>;
  /** autopilot: update dependencies within their constraints (composer update, npm update); returns what moved */
  updateDeps?: (fs: VirtualFs) => Promise<{ updates: DepUpdate[]; changedFiles: string[] }>;
  commit: (message: string, files: string[]) => Promise<string>;
  push: (branch: string) => Promise<string>;
  emit: (e: RunnerEvent) => Promise<void> | void;
  now: () => number;
}

export interface AgentSpec {
  runId: string;
  appPath: string;
  hopFrom: number;
  hopTo: number;
  extendedVerify: boolean;
  /** ms epoch; the watchdog inside the agent stops work after this (the cron reaper is the backstop) */
  deadlineAt: number;
  recipes: Recipe[];
  rules: Rule[];
  mode?: "upgrade" | "deps";
  /** fixed branch name (autopilot) */
  branch?: string;
  pins?: Pins;
}

class DeadlineError extends Error {}
export const branchName = (hopTo: number, runId: string) => `stepclimb/laravel-${hopTo}-${runId.slice(-8)}`;

const join = (dir: string, f: string) => (dir ? `${dir}/${f}` : f);

export async function runAgent(spec: AgentSpec, env: RunEnv): Promise<RunResult> {
  const started = env.now();
  const squawks: Squawk[] = [];
  const recipesOut: RunResult["recipes"] = [];
  const log = async (text: string, stream: "stdout" | "stderr" | "system" = "system") => env.emit({ type: "log_chunk", stream, text: redactSecrets(text) });
  const check = () => { if (env.now() > spec.deadlineAt) throw new DeadlineError("deadline"); };
  const step = async <T>(name: string, fn: () => Promise<T>, pass: (v: T) => boolean = () => true): Promise<T> => {
    check();
    await env.emit({ type: "step", name, status: "running" });
    const t0 = env.now();
    try {
      const v = await fn();
      await env.emit({ type: "step", name, status: pass(v) ? "passed" : "failed", durationMs: env.now() - t0 });
      return v;
    } catch (e) {
      await env.emit({ type: "step", name, status: "failed", durationMs: env.now() - t0 });
      throw e;
    }
  };

  const verification: RunResult["verification"] = { composer: false, build: null, tests: null };
  const base = (over: Partial<RunResult>): RunResult => ({
    verified: false, hasTests: false, recipes: recipesOut, repair: { passes: 0, rulesApplied: [], unmatchedSignatures: [], stopReason: "not_run" },
    verification, squawks, computeSeconds: Math.round((env.now() - started) / 1000), changedFileCount: 0, ...over,
  });
  const changed = new Set<string>();
  let hasTests = false;
  let repair: RunResult["repair"] = { passes: 0, rulesApplied: [], unmatchedSignatures: [], stopReason: "not_run" };
  let verified = false;
  let timedOut = false;
  const branch = spec.branch ?? branchName(spec.hopTo, spec.runId);
  const recipes = applyPins(spec.recipes, spec.pins?.recipes);
  const rules = applyPins(spec.rules, spec.pins?.rules);
  let updates: DepUpdate[] | undefined;

  try {
    const app = await step("detect", async () => detectApp({
      path: spec.appPath,
      composerJson: env.fs.read(join(spec.appPath, "composer.json")),
      composerLock: env.fs.read(join(spec.appPath, "composer.lock")),
      packageJson: env.fs.read(join(spec.appPath, "package.json")),
    }), (a) => a.isLaravel && a.supported);
    if (!app.isLaravel || !app.supported) return base({ aborted: app.unsupportedReason ?? "not_a_supported_laravel_app" });
    hasTests = app.testFramework !== "none";
    if (spec.mode === "deps") {
      const u = await step("update-deps", async () => (env.updateDeps ? env.updateDeps(env.fs) : { updates: [], changedFiles: [] }));
      updates = u.updates;
      if (u.updates.length === 0) return base({ updates: [], hasTests });
      u.changedFiles.forEach((f) => changed.add(f));
      await env.commit(`Stepclimb autopilot: update ${u.updates.length} dependenc${u.updates.length === 1 ? "y" : "ies"}`, u.changedFiles);
    } else if (app.laravelMajor !== spec.hopFrom) return base({ aborted: `app_is_on_${app.laravelMajor ?? "unknown"}_not_${spec.hopFrom}` });

    const hops = spec.mode === "deps" ? [] : planHops(app, spec.hopFrom, spec.hopTo, recipes);
    for (const hop of hops) {
      const skeleton = await env.skeleton?.(hop);
      for (const recipe of hop.recipes) {
        const r = await step(`recipe:${recipe.key}`, async () => applyRecipe(recipe, env.fs, { appPath: spec.appPath, app, ...(skeleton ? { skeleton } : {}) }), () => true);
        squawks.push(...r.squawks);
        for (const x of r.externalSteps) {
          const out = await env.runExternal?.(x, env.fs);
          if (out) await log(`${x.id}: ${out.ok ? "ok" : "failed"}\n${excerptOf(out.output, 1500)}`, out.ok ? "stdout" : "stderr");
          if (out && !out.ok) squawks.push({ severity: "review", title: `Automated step ${x.id} failed`, bodyMd: `The ${x.kind} step \`${x.id}\` did not finish. Review the matching files by hand.`, agentPrompt: `Run ${x.command.join(" ")} locally and fix what it reports, then re-run the tests.` });
        }
        r.changedFiles.forEach((f) => changed.add(f));
        const sha = r.changedFiles.length > 0 ? await env.commit(r.commitMessage, r.changedFiles) : null;
        recipesOut.push({ key: r.recipeKey, version: r.recipeVersion, commitSha: sha, changedFiles: r.changedFiles, noop: r.noop });
      }
    }

    // verification: composer (incl. lock), then build, then tests. The repair loop re-runs this after each fix commit.
    const verify = async (fs: VirtualFs): Promise<VerifyResult> => {
      check();
      const c = await env.verifyStage("composer", fs);
      verification.composer = c.passed;
      await env.emit({ type: "step", name: "verify:composer", status: c.passed ? "passed" : "failed" });
      await log(excerptOf(c.output, 1200), c.passed ? "stdout" : "stderr");
      if (!c.passed) return c;
      if (app.usesVite) {
        const b = await env.verifyStage("build", fs);
        verification.build = b.passed;
        await env.emit({ type: "step", name: "verify:build", status: b.passed ? "passed" : "failed" });
        await log(excerptOf(b.output, 1200), b.passed ? "stdout" : "stderr");
        if (!b.passed) return b;
      }
      if (hasTests) {
        const t = await env.verifyStage("tests", fs);
        verification.tests = t.passed;
        await env.emit({ type: "step", name: "verify:tests", status: t.passed ? "passed" : "failed" });
        await log(excerptOf(t.output, 1200), t.passed ? "stdout" : "stderr");
        return t;
      }
      await env.emit({ type: "step", name: "verify:tests", status: "skipped", detail: "no test suite" });
      return { passed: true, output: "no test suite found", stage: "composer" };
    };

    const outcome = await runRepairLoop({
      verify, rules, fs: env.fs, hop: { from: spec.hopFrom, to: spec.hopTo },
      maxLoops: spec.extendedVerify ? LIMITS.extendedRepairLoops : LIMITS.repairLoops,
    });
    // the loop applied its fixes to the fs: record them as `Repair:` commits (external steps first)
    for (const c of outcome.commits) {
      for (const x of c.externalSteps) await env.runExternal?.(x, env.fs);
      c.changedFiles.forEach((f) => changed.add(f));
      await env.commit(c.message, c.changedFiles);
    }
    repair = { passes: outcome.commits.length, rulesApplied: outcome.appliedRuleKeys, unmatchedSignatures: outcome.unmatchedSignatures, stopReason: outcome.stopReason };
    squawks.push(...outcome.squawks);
    verified = outcome.passed && hasTests;
  } catch (e) {
    if (!(e instanceof DeadlineError)) {
      await log(`agent error: ${e instanceof Error ? e.message : "unknown"}`, "stderr");
      return base({ aborted: e instanceof Error ? e.message : "agent_error", hasTests, changedFileCount: changed.size });
    }
    timedOut = true;
    squawks.push({ severity: "must_fix", title: "Run timed out", bodyMd: "The run hit its wall clock limit. The branch holds the recipes applied so far; verification did not finish.", agentPrompt: "Check out this branch, run `composer update` and the test suite, and finish the remaining upgrade steps from the Laravel upgrade guide." });
  }
  const head = await env.push(branch);
  await env.emit({ type: "pushed", branch, headSha: head });
  return base({ verified, hasTests, repair, timedOut, changedFileCount: changed.size, ...(updates ? { updates } : {}) });
}
