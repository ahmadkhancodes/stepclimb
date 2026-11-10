import { MemoryFs, type VirtualFs } from "@/lib/engine/vfs";
import type { Recipe } from "@/lib/engine/recipes";
import type { Rule, VerifyResult } from "@/lib/engine/repair";
import { runAgent, type RunEnv } from "./agent";
import { signEvent, type RunnerEvent } from "./events";
import type { DeliverEvent, RunnerBackend, RunnerHandle, RunSpec } from "./runner";

export interface FakeRunnerOptions {
  /** the customer repo: path -> content */
  repo: Record<string, string>;
  recipes: Recipe[];
  rules: Rule[];
  /** scripted verification; `n` counts calls per stage starting at 1 */
  verify?: (stage: "composer" | "build" | "tests" | "larastan", fs: VirtualFs, n: number) => VerifyResult;
  skeleton?: RunEnv["skeleton"];
  /** autopilot dependency update; the default moves nothing */
  updateDeps?: RunEnv["updateDeps"];
  /** the sandbox never reports back (watchdog tests) */
  hang?: boolean;
  /** start() throws */
  failStart?: boolean;
  /** advancing clock for deadline tests */
  tickMs?: number;
  /** injected epoch ms clock the in-process agent starts from (default: real time) */
  now?: () => number;
  /** the git host that sees the pushes (fixture host), so the orchestrator can resolve branch heads like on GitHub */
  host?: { moveBranch(fullName: string, branch: string, sha: string): Promise<void> };
}

/** Deterministic backend for tests: runs the real agent in process on a MemoryFs. No network, no processes. */
export class FakeRunner implements RunnerBackend {
  readonly name = "fake";
  readonly active = new Set<string>();
  readonly stopped: string[] = [];
  readonly pushed: { branch: string; fs: Record<string, string> }[] = [];
  readonly commits: { message: string; files: string[] }[] = [];
  readonly events: RunnerEvent[] = [];
  private n = 0;
  constructor(private opts: FakeRunnerOptions) {}

  async start(spec: RunSpec, deliver: DeliverEvent): Promise<RunnerHandle> {
    if (this.opts.failStart) throw new Error("sandbox_create_failed");
    const handle = { backend: this.name, id: `fake-${++this.n}` };
    this.active.add(handle.id);
    if (this.opts.hang) return handle;
    // a fresh "microVM" per run: nothing carries over. A base branch Stepclimb pushed earlier is the stacked PR base (catch up).
    const stacked = [...this.pushed].reverse().find((p) => p.branch === spec.baseBranch);
    const fs = new MemoryFs(stacked ? stacked.fs : this.opts.repo);
    const counts: Record<string, number> = {};
    let seq = 0;
    let clock = (this.opts.now ?? Date.now)();
    const send = async (event: RunnerEvent) => {
      this.events.push(event);
      const e = { seq: ++seq, event };
      await deliver(e, await signEvent(spec.eventSecret, spec.runId, e));
    };
    const env: RunEnv = {
      fs,
      ...(this.opts.skeleton ? { skeleton: this.opts.skeleton } : {}),
      ...(this.opts.updateDeps ? { updateDeps: this.opts.updateDeps } : {}),
      verifyStage: async (stage, f) => {
        counts[stage] = (counts[stage] ?? 0) + 1;
        return this.opts.verify?.(stage, f, counts[stage]!) ?? { passed: true, output: `${stage} ok`, stage };
      },
      commit: async (message, files) => { this.commits.push({ message, files }); return `sha${String(this.commits.length).padStart(4, "0")}`; },
      push: async (branch) => {
        this.pushed.push({ branch, fs: fs.snapshot() });
        const head = `head${this.commits.length}`;
        await this.opts.host?.moveBranch(spec.fullName, branch, head);
        return head;
      },
      emit: send,
      now: () => (clock += this.opts.tickMs ?? 10),
    };
    await send({ type: "started", sandboxId: handle.id });
    const result = await runAgent({ runId: spec.runId, appPath: spec.appPath, hopFrom: spec.hopFrom, hopTo: spec.hopTo, extendedVerify: spec.extendedVerify, deadlineAt: spec.deadlineAt, recipes: this.opts.recipes, rules: this.opts.rules, ...(spec.mode ? { mode: spec.mode } : {}), ...(spec.branch ? { branch: spec.branch } : {}), ...(spec.pins ? { pins: spec.pins } : {}) }, env);
    await send({ type: "result", result });
    this.active.delete(handle.id);
    return handle;
  }
  async cancel(h: RunnerHandle) { this.active.delete(h.id); this.stopped.push(h.id); }
  async listActive() { return [...this.active].map((id) => ({ backend: this.name, id })); }
}
