import type { SignedEvent } from "./events";

/** What a backend needs to run one upgrade. Contains no long lived secret: `gitToken` is a repo scoped installation token (1 h). */
export interface RunSpec {
  runId: string;
  fullName: string;
  baseBranch: string;
  appPath: string;
  hopFrom: number;
  hopTo: number;
  extendedVerify: boolean;
  deadlineAt: number;
  /** per run HMAC secret used to sign events */
  eventSecret: string;
  callbackUrl: string;
  gitToken: string;
  /** `deps`: autopilot dependency update instead of a hop */
  mode?: "upgrade" | "deps";
  /** fixed branch (autopilot refreshes one branch instead of opening a new one) */
  branch?: string;
  /** founder pins: recipes and rules switched off or held to a version */
  pins?: import("./pins").Pins;
}
export interface RunnerHandle { backend: string; id: string }
/** In process delivery of a signed event (the HTTP callback does the same through /api/runner/events). */
export type DeliverEvent = (e: SignedEvent, signature: string) => Promise<void>;

/**
 * The contract every backend implements (docs/ARCHITECTURE.md section 2):
 * start -> signed events -> result, plus cancel, hard limits and a way to list what is still alive.
 * Vercel Sandbox is first; a Firecracker runner on the VPS later implements the same four methods.
 */
export interface RunnerBackend {
  readonly name: string;
  start(spec: RunSpec, deliver: DeliverEvent): Promise<RunnerHandle>;
  cancel(handle: RunnerHandle): Promise<void>;
  /** sandboxes that are not stopped (leak audit and watchdog) */
  listActive(): Promise<RunnerHandle[]>;
}
