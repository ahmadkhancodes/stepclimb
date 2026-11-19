import { HANDBACK_PATH } from "./handback";
import { EGRESS_ALLOW } from "./types";
import type { DeliverEvent, RunnerBackend, RunnerHandle, RunSpec } from "./runner";

/**
 * Thin seam over the Vercel Sandbox SDK (`@vercel/sandbox`): `sandbox/vercel-driver.ts` is the real adapter, tests use a fake.
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
  /** upload the agent bundle and the recipes it needs */
  writeFiles?(id: string, files: { path: string; content: string }[]): Promise<void>;
  /** read a file the agent left behind (the handback); null when absent */
  readFile?(id: string, path: string): Promise<Buffer | null>;
  stop(id: string): Promise<void>;
  list(): Promise<{ id: string; status: "pending" | "running" | "stopping" | "stopped" | "failed" }[]>;
}

export interface SandboxRunnerOptions {
  driver: SandboxDriver;
  snapshot?: string;
  extraAllow?: string[];
  /** files to upload before the agent starts (agent bundle, recipes, rules), keyed by absolute path in the VM */
  payload?: () => Promise<{ path: string; content: string }[]>;
}
export const AGENT_DIR = "/home/vercel-sandbox/stepclimb";

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
      // git over https wants Basic; the REST host (composer and npm fetch zipballs from it) wants Bearer, and an authenticated
      // call gets 5000 requests an hour instead of 60 per shared IP. Both tokens are repo scoped and read only.
      injectionRules: spec.gitToken ? [
        { host: "github.com", headers: { authorization: basic(spec.gitToken) } },
        { host: "api.github.com", headers: { authorization: `Bearer ${spec.gitToken}` } },
      ] : [],
    });
    const files = (await this.o.payload?.()) ?? [];
    if (files.length > 0) await this.o.driver.writeFiles?.(sb.id, files);
    await this.o.driver.runDetached(sb.id, files.length > 0 ? ["node", `${AGENT_DIR}/agent.mjs`] : ["stepclimb-agent", "run"], {
      SANDBOX_ID: sb.id, STEPCLIMB_AGENT_AUTORUN: "1", MODE: spec.mode ?? "upgrade", ...(spec.branch ? { BRANCH: spec.branch } : {}), ...(spec.pins ? { PINS: JSON.stringify(spec.pins) } : {}),
      RECIPES_DIR: `${AGENT_DIR}/recipes`, RULES_DIR: `${AGENT_DIR}/repair-rules`,
      RUN_ID: spec.runId, REPO: spec.fullName, BASE_BRANCH: spec.baseBranch, APP_PATH: spec.appPath,
      HOP_FROM: String(spec.hopFrom), HOP_TO: String(spec.hopTo), EXTENDED_VERIFY: spec.extendedVerify ? "1" : "0",
      DEADLINE_AT: String(spec.deadlineAt), CALLBACK_URL: spec.callbackUrl, EVENT_SECRET: spec.eventSecret,
    });
    return { backend: this.name, id: sb.id };
  }
  async cancel(h: RunnerHandle) { await this.o.driver.stop(h.id); }
  async collect(h: RunnerHandle) {
    const buf = await this.o.driver.readFile?.(h.id, HANDBACK_PATH);
    return buf ? buf.toString("utf8") : null;
  }
  async listActive() {
    return (await this.o.driver.list()).filter((s) => s.status === "running" || s.status === "pending" || s.status === "stopping").map((s) => ({ backend: this.name, id: s.id }));
  }
}
