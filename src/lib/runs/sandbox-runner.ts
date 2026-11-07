import { EGRESS_ALLOW } from "./types";
import type { DeliverEvent, RunnerBackend, RunnerHandle, RunSpec } from "./runner";

/**
 * Thin seam over the Vercel Sandbox SDK (`@vercel/sandbox`). The SDK is not a dependency yet: it is added with the first
 * real run (docs/MANUAL_STEPS.md), by writing one adapter that implements this interface. Tests use a fake driver.
 */
export interface SandboxDriver {
  create(opts: {
    snapshot: string;
    vcpus: number;
    timeoutMs: number;
    networkPolicy: { allow: string[] };
    /** headers added by the platform to requests for a host, so the secret never exists inside the VM */
    injectionRules: { host: string; headers: Record<string, string> }[];
  }): Promise<{ id: string }>;
  /** start a command without waiting (the function returns, events come back over HTTP) */
  runDetached(id: string, cmd: string[], env: Record<string, string>): Promise<void>;
  stop(id: string): Promise<void>;
  list(): Promise<{ id: string; status: "pending" | "running" | "stopping" | "stopped" | "failed" }[]>;
}

export interface SandboxRunnerOptions { driver: SandboxDriver; snapshot?: string; extraAllow?: string[] }

const basic = (token: string) => `Basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;

export class VercelSandboxRunner implements RunnerBackend {
  readonly name = "vercel-sandbox";
  constructor(private o: SandboxRunnerOptions) {}

  async start(spec: RunSpec, _deliver: DeliverEvent): Promise<RunnerHandle> {
    void _deliver; // events arrive through POST /api/runner/events
    const callbackHost = new URL(spec.callbackUrl).hostname;
    const wall = Math.max(spec.deadlineAt - Date.now(), 60_000);
    const sb = await this.o.driver.create({
      snapshot: this.o.snapshot ?? "stepclimb-runner-v1",
      vcpus: 4, // 8 GB RAM
      timeoutMs: wall + 5 * 60_000,
      networkPolicy: { allow: [...EGRESS_ALLOW, callbackHost, ...(this.o.extraAllow ?? [])] },
      injectionRules: [{ host: "github.com", headers: { authorization: basic(spec.gitToken) } }],
    });
    await this.o.driver.runDetached(sb.id, ["stepclimb-agent", "run"], {
      RUN_ID: spec.runId, REPO: spec.fullName, BASE_BRANCH: spec.baseBranch, APP_PATH: spec.appPath,
      HOP_FROM: String(spec.hopFrom), HOP_TO: String(spec.hopTo), EXTENDED_VERIFY: spec.extendedVerify ? "1" : "0",
      DEADLINE_AT: String(spec.deadlineAt), CALLBACK_URL: spec.callbackUrl, EVENT_SECRET: spec.eventSecret,
    });
    return { backend: this.name, id: sb.id };
  }
  async cancel(h: RunnerHandle) { await this.o.driver.stop(h.id); }
  async listActive() {
    return (await this.o.driver.list()).filter((s) => s.status === "running" || s.status === "pending" || s.status === "stopping").map((s) => ({ backend: this.name, id: s.id }));
  }
}
