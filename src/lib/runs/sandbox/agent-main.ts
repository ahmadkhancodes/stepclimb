/* Entry point that runs INSIDE the Vercel Sandbox (bundled by scripts/build-agent.ts, started detached by the orchestrator).
 * It holds the per run event secret; customer commands run as another user without it. It never pushes (D-35). */
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { loadRecipes } from "@/lib/engine/recipes";
import { loadRules, redactSecrets } from "@/lib/engine/repair";
import { runAgent } from "../agent";
import { signEvent, type RunnerEvent, type SignedEvent } from "../events";
import { HANDBACK_PATH } from "../handback";
import { createDiskEnv, type Exec } from "./disk-env";
import { runnerPhpSatisfies } from "./php";

const WORK = process.env.WORK_DIR ?? "/work";
const CUSTOMER = "stepclimb-run";
const PATH = "/home/vercel-sandbox/.local/bin:/vercel/runtimes/node24/bin:/usr/local/bin:/usr/bin:/bin";

/** Customer commands: separate user, scrubbed environment, hard timeout. Output is capped, so a chatty build cannot fill memory. */
export const realExec: Exec = (cmd, o) => new Promise((resolve) => {
  const secs = Math.max(5, Math.ceil(o.timeoutMs / 1000));
  const env = { HOME: `/home/${CUSTOMER}`, PATH, LANG: "C.UTF-8", CI: "1", COMPOSER_NO_INTERACTION: "1", COMPOSER_ALLOW_SUPERUSER: "0", COMPOSER_MEMORY_LIMIT: "-1", NPM_CONFIG_UPDATE_NOTIFIER: "false", GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "safe.directory", GIT_CONFIG_VALUE_0: "*", ...(o.env ?? {}) };
  const assigns = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  const script = `umask 002; cd ${JSON.stringify(o.cwd)} && exec timeout -k 5 ${secs} bash -c ${JSON.stringify(cmd)}`;
  const p = spawn("sudo", ["-n", "-u", CUSTOMER, "-H", "env", "-i", ...assigns, "bash", "-c", script], { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  const take = (b: Buffer) => { out = (out + b.toString("utf8")).slice(-64_000); };
  p.stdout.on("data", take);
  p.stderr.on("data", take);
  p.on("error", (e) => resolve({ code: 127, output: String(e.message) }));
  p.on("close", (code) => resolve({ code: code ?? 1, output: out }));
});

export async function main(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  process.umask(0o002);
  const need = (k: string) => { const v = env[k]; if (!v) throw new Error(`missing_env_${k}`); return v; };
  const runId = need("RUN_ID");
  const secret = need("EVENT_SECRET");
  const url = need("CALLBACK_URL");
  let seq = 0;
  const post = async (event: RunnerEvent) => {
    const e: SignedEvent = { seq: ++seq, event };
    const body = JSON.stringify({ runId, seq: e.seq, event });
    const sig = await signEvent(secret, runId, e);
    // local copy for debugging and the manual e2e script (the secret is not in it)
    try { appendFileSync("/home/vercel-sandbox/events.jsonl", JSON.stringify({ seq: e.seq, event }) + "\n"); } catch { /* best effort */ }
    for (let i = 0; i < 4; i++) {
      try {
        const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-stepclimb-signature": sig }, body, signal: AbortSignal.timeout(20_000) });
        if (r.ok || r.status === 409 || r.status === 401) return;
      } catch { /* retry */ }
      await new Promise((r) => setTimeout(r, 1_000 * (i + 1)));
    }
  };
  const result = async (r: Extract<RunnerEvent, { type: "result" }>["result"]) => post({ type: "result", result: r });
  const empty = (aborted: string) => ({ verified: false, hasTests: false, recipes: [], repair: { passes: 0, rulesApplied: [], unmatchedSignatures: [], stopReason: "not_run" }, verification: { composer: false, build: null, tests: null }, squawks: [], computeSeconds: 0, changedFileCount: 0, aborted });
  await post({ type: "started", sandboxId: env.SANDBOX_ID ?? "sandbox" });
  try {
    const repo = need("REPO");
    const root = `${WORK}/repo`;
    mkdirSync(WORK, { recursive: true });
    // clone: the platform adds the (read only) token to requests for github.com, so no credential exists in this VM
    execFileSync("git", ["-c", "core.hooksPath=/dev/null", "clone", "--depth", "1", "--no-tags", "--branch", need("BASE_BRANCH"), `https://github.com/${repo}.git`, root], { stdio: "pipe", timeout: 180_000, env: { PATH, HOME: "/home/vercel-sandbox", GIT_TERMINAL_PROMPT: "0" } as unknown as NodeJS.ProcessEnv });
    const baseSha = execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const appPath = env.APP_PATH ?? "";
    const mode = env.MODE === "deps" ? "deps" : "upgrade";
    const deadlineAt = Number(need("DEADLINE_AT"));
    const de = createDiskEnv({
      root, appPath, mode, baseSha, exec: realExec, emit: post, now: Date.now, deadlineAt,
      writeHandback: (hb) => writeFileSync(HANDBACK_PATH, JSON.stringify(hb), { mode: 0o600 }),
    });
    const composerJson = de.fs.read(appPath ? `${appPath}/composer.json` : "composer.json");
    let phpReq: string | undefined;
    try { phpReq = (JSON.parse(composerJson ?? "{}") as { require?: { php?: string } }).require?.php; } catch { /* detect reports it */ }
    if (!runnerPhpSatisfies(phpReq)) { await result(empty("php_constraint_unsupported_by_runner")); return; }
    const out = await runAgent({
      runId, appPath, hopFrom: Number(env.HOP_FROM ?? 0), hopTo: Number(env.HOP_TO ?? 0), extendedVerify: env.EXTENDED_VERIFY === "1", deadlineAt,
      recipes: loadRecipes(env.RECIPES_DIR ?? "/home/vercel-sandbox/stepclimb/recipes"), rules: loadRules(env.RULES_DIR ?? "/home/vercel-sandbox/stepclimb/repair-rules"),
      ...(mode === "deps" ? { mode: "deps" as const } : {}), ...(env.BRANCH ? { branch: env.BRANCH } : {}), ...(env.PINS ? { pins: JSON.parse(env.PINS) } : {}),
    }, de);
    await result(out);
  } catch (e) {
    await post({ type: "log_chunk", stream: "stderr", text: redactSecrets(`agent crashed: ${e instanceof Error ? e.message : "unknown"}`) });
    await result(empty(redactSecrets(e instanceof Error ? e.message : "agent_crash").slice(0, 400)));
  }
}

if (process.env.STEPCLIMB_AGENT_AUTORUN === "1") void main();
