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
}

export interface SignedEvent { seq: number; event: RunnerEvent }

const canonical = (runId: string, e: SignedEvent) => `${runId}.${e.seq}.${JSON.stringify(e.event)}`;
export const signEvent = (secret: string, runId: string, e: SignedEvent) => hmacSha256Hex(secret, canonical(runId, e));
export async function verifyEvent(secret: string, runId: string, e: SignedEvent, signature: string | null): Promise<boolean> {
  if (!secret || !signature) return false;
  return safeEqual(await signEvent(secret, runId, e), signature);
}
