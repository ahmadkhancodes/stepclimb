/**
 * Manual end to end check of the real sandbox runner WITHOUT touching GitHub writes: starts a real Vercel Sandbox from the
 * runner snapshot, clones a public repo, runs the autopilot dependency update + verification, then prints the events and the
 * handback summary the orchestrator would publish.
 * Usage: RUNNER_SNAPSHOT_ID=snap_... VERCEL_TEAM_ID=... VERCEL_PROJECT_ID=... npx tsx scripts/sandbox-e2e.ts [owner/repo] [branch]
 */
import { AGENT_FILES } from "../src/lib/runs/sandbox/agent-payload.generated";
import { createVercelDriver } from "../src/lib/runs/sandbox/vercel-driver";
import { AGENT_DIR, VercelSandboxRunner } from "../src/lib/runs/sandbox-runner";
import { HANDBACK_PATH, parseHandback } from "../src/lib/runs/handback";

const token = process.env.SANDBOX_VERCEL_TOKEN ?? process.env.VERCEL_TOKEN_NEW_ACCOUNT!;
const driver = createVercelDriver({ token, teamId: process.env.VERCEL_TEAM_ID!, projectId: process.env.VERCEL_PROJECT_ID! });
const [repo = "laravel/laravel", branch = "12.x"] = process.argv.slice(2);

async function main() {
  const runner = new VercelSandboxRunner({ driver, snapshot: process.env.RUNNER_SNAPSHOT_ID!, payload: async () => AGENT_FILES.map((f) => ({ path: `${AGENT_DIR}/${f.path}`, content: f.content })) });
  const t0 = Date.now();
  const h = await runner.start({ runId: "e2e0001", fullName: repo, baseBranch: branch, appPath: "", hopFrom: 12, hopTo: 12, extendedVerify: false, deadlineAt: Date.now() + Number(process.argv[4] ?? 20) * 60_000, eventSecret: "e2e-secret", callbackUrl: "https://stepclimb.buffersoltech.com/api/runner/events", gitToken: "", mode: "deps", branch: "stepclimb/autopilot" }, async () => undefined);
  console.log(`started ${h.id} in ${Date.now() - t0} ms`);
  let events = "";
  for (let i = 0; i < 240; i++) {
    await new Promise((r) => setTimeout(r, 5_000));
    events = (await driver.readFile!(h.id, "/home/vercel-sandbox/events.jsonl"))?.toString("utf8") ?? "";
    if (events.includes('"type":"result"')) break;
  }
  for (const line of events.trim().split("\n")) {
    const e = JSON.parse(line) as { seq: number; event: { type: string; [k: string]: unknown } };
    const ev = e.event;
    console.log(ev.type === "log_chunk" ? `log ${String(ev.text).slice(0, 220).replace(/\n/g, " | ")}` : ev.type === "result" ? `RESULT ${JSON.stringify({ ...(ev.result as object), squawks: undefined, updates: ((ev.result as { updates?: unknown[] }).updates ?? []).length }).slice(0, 500)}` : JSON.stringify(ev).slice(0, 200));
  }
  const raw = await runner.collect(h);
  if (raw) { const hb = parseHandback(raw); console.log(`handback: base ${hb.baseSha.slice(0, 8)}, ${hb.commits.length} commit(s): ${hb.commits.map((c) => `"${c.message}" [${c.files.map((f) => f.path).join(", ")}]`).join("; ")}`); } else console.log(`no handback at ${HANDBACK_PATH}`);
  await runner.cancel(h);
  console.log(`total ${Math.round((Date.now() - t0) / 1000)} s`);
}
void main();
