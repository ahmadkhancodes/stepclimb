import type { EffortBand, Squawk } from "@/lib/engine/types";

/** Run lifecycle. `timed_out` still opens a draft PR from what was pushed. */
export const RUN_STATUSES = ["queued", "starting", "running", "finalizing", "succeeded", "failed", "timed_out", "canceled"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];
export const TERMINAL: readonly RunStatus[] = ["succeeded", "failed", "timed_out", "canceled"];
export const isTerminal = (s: RunStatus) => TERMINAL.includes(s);

/** Legal transitions of the run state machine (anything else is rejected). */
export const TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  queued: ["starting", "canceled", "failed"],
  starting: ["running", "failed", "canceled", "timed_out"],
  running: ["finalizing", "failed", "canceled", "timed_out"],
  finalizing: ["succeeded", "failed", "timed_out"],
  succeeded: [],
  failed: [],
  timed_out: [],
  canceled: [],
};

export type RunKind = "upgrade" | "noop";
export type CheckConclusion = "success" | "failure" | "neutral";
export type CreditKind = "to_latest" | "to_previous" | "older_hop" | "side_task" | "small_converter" | "extended_verify";
export type StepStatus = "pending" | "running" | "passed" | "failed" | "skipped" | "blocked_host";

export interface RunDoc {
  accountId: string;
  repoId: string;
  installationId: string;
  fullName: string;
  baseBranch: string;
  appPath: string;
  kind: RunKind;
  status: RunStatus;
  hopFrom: number;
  hopTo: number;
  branch: string | null;
  headSha: string | null;
  prNumber: number | null;
  prUrl: string | null;
  prDraft: boolean;
  checkConclusion: CheckConclusion | null;
  verified: boolean | null;
  repairPasses: number;
  repairRulesApplied: string[];
  computeSeconds: number;
  sandboxId: string | null;
  /** how the run is paid: plan entitlement or a one time credit */
  billing: { via: "plan" | "credit"; creditId: string | null; creditKind: CreditKind | null };
  idempotencyKey: string | null;
  extendedVerify: boolean;
  /** per run HMAC secret for runner events; useless after the run */
  eventSecret: string;
  lastSeq: number;
  error: string | null;
  effortBand: EffortBand | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  /** wall clock deadline (ms epoch) */
  deadlineAt: number | null;
  leaseUntil: number | null;
  updatedAt: Date;
}

export interface RunStepDoc { runId: string; seq: number; name: string; status: StepStatus; detail: string | null; durationMs: number | null; createdAt: Date }
export interface RunLogDoc { runId: string; seq: number; stream: "stdout" | "stderr" | "system"; text: string; at: Date }
export interface SquawkDoc extends Squawk { runId: string; resolvedBy: string | null; createdAt: Date }
export interface CreditDoc { accountId: string; kind: CreditKind; remaining: number; expiresAt: Date; stripeSessionId: string | null; createdAt: Date }

/** Hard limits (docs/ARCHITECTURE.md section 5). */
export const LIMITS = {
  wallClockMs: 25 * 60_000,
  extendedWallClockMs: 60 * 60_000,
  memoryGb: 8,
  repairLoops: 3,
  extendedRepairLoops: 5,
  maxLogChunk: 8_000,
  maxLogChunksPerRun: 2_000,
  perAccountConcurrency: 2,
  globalConcurrency: 20,
  /** no output for this long while running counts as stalled */
  silenceMs: 5 * 60_000,
  creditTtlDays: 365,
} as const;

/** Egress allow list (architecture section 5, step 2). Everything else is blocked and logged as `blocked_host`. */
export const EGRESS_ALLOW = [
  "github.com", "api.github.com", "codeload.github.com", "objects.githubusercontent.com",
  "repo.packagist.org", "packagist.org", "registry.npmjs.org",
] as const;

/** Never call an LLM host from a run (CI egress audit asserts this list stays disjoint from the allow list). */
export const EGRESS_DENY_AI = ["api.anthropic.com", "api.openai.com", "generativelanguage.googleapis.com"] as const;
