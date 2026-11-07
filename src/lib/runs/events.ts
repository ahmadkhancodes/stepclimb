import { hmacSha256Hex, safeEqual } from "@/lib/ids";

/** Events a runner sends back (architecture section 2: started, step, log_chunk, pushed, result). */
export type RunnerEvent =
  | { type: "started"; sandboxId: string }
  | { type: "step"; name: string; status: "running" | "passed" | "failed" | "skipped" | "blocked_host"; detail?: string; durationMs?: number }
  | { type: "log_chunk"; stream: "stdout" | "stderr" | "system"; text: string }
  | { type: "pushed"; branch: string; headSha: string }
  | { type: "result"; result: RunResult };

export interface RunResult {
  /** verification outcome: tests (or build) passed after the repair pass */
  verified: boolean;
  hasTests: boolean;
  recipes: { key: string; version: string; commitSha: string | null; changedFiles: string[]; noop: boolean }[];
  repair: { passes: number; rulesApplied: string[]; unmatchedSignatures: string[]; stopReason: string };
  verification: { composer: boolean; build: boolean | null; tests: boolean | null };
  squawks: { severity: "must_fix" | "review" | "note"; file?: string; line?: number; title: string; bodyMd: string; agentPrompt: string }[];
  computeSeconds: number;
  changedFileCount: number;
  /** the wall clock ran out: branch holds what was applied so far */
  timedOut?: boolean;
  /** the agent could not start work (not Laravel, unsupported, no recipe) */
  aborted?: string;
  /** autopilot: dependencies that moved (empty means nothing to do and no PR) */
  updates?: DepUpdate[];
}

export interface DepUpdate { ecosystem: "composer" | "npm"; name: string; from: string; to: string }

export interface SignedEvent { seq: number; event: RunnerEvent }

const canonical = (runId: string, e: SignedEvent) => `${runId}.${e.seq}.${JSON.stringify(e.event)}`;
export const signEvent = (secret: string, runId: string, e: SignedEvent) => hmacSha256Hex(secret, canonical(runId, e));
export async function verifyEvent(secret: string, runId: string, e: SignedEvent, signature: string | null): Promise<boolean> {
  if (!secret || !signature) return false;
  return safeEqual(await signEvent(secret, runId, e), signature);
}

// ---- input validation: everything a sandbox sends is untrusted (customer code runs next to the agent) ----
import { z } from "zod";

const str = (max: number) => z.string().max(max);
const SquawkSchema = z.object({
  severity: z.enum(["must_fix", "review", "note"]),
  file: str(500).optional(),
  line: z.number().int().min(1).max(10_000_000).optional(),
  title: str(2_000),
  bodyMd: str(20_000),
  agentPrompt: str(20_000),
});
export const RunResultSchema = z.object({
  verified: z.boolean(),
  hasTests: z.boolean(),
  recipes: z.array(z.object({ key: str(200), version: str(50), commitSha: str(64).nullable(), changedFiles: z.array(str(500)).max(5_000), noop: z.boolean() })).max(100),
  repair: z.object({ passes: z.number().int().min(0).max(10), rulesApplied: z.array(str(200)).max(100), unmatchedSignatures: z.array(str(4_000)).max(50), stopReason: str(100) }),
  verification: z.object({ composer: z.boolean(), build: z.boolean().nullable(), tests: z.boolean().nullable() }),
  squawks: z.array(SquawkSchema).max(200),
  computeSeconds: z.number().min(0).max(86_400),
  changedFileCount: z.number().int().min(0).max(1_000_000),
  timedOut: z.boolean().optional(),
  aborted: str(500).optional(),
  updates: z.array(z.object({ ecosystem: z.enum(["composer", "npm"]), name: str(214), from: str(100), to: str(100) })).max(500).optional(),
});
export const RunnerEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("started"), sandboxId: str(200) }),
  z.object({ type: z.literal("step"), name: str(200), status: z.enum(["running", "passed", "failed", "skipped", "blocked_host"]), detail: str(2_000).optional(), durationMs: z.number().min(0).max(86_400_000).optional() }),
  z.object({ type: z.literal("log_chunk"), stream: z.enum(["stdout", "stderr", "system"]), text: str(64_000) }),
  z.object({ type: z.literal("pushed"), branch: str(255), headSha: str(64) }),
  z.object({ type: z.literal("result"), result: RunResultSchema }),
]);
