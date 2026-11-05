import type { ExternalStep, Squawk } from '../types.js';

export const RULE_CATEGORIES = ['composer', 'larastan', 'php', 'tests', 'build'] as const;
export type RuleCategory = (typeof RULE_CATEGORIES)[number];

export const FIX_KINDS = ['composer_constraint', 'config_patch', 'file_template', 'rector_rule', 'php_parser_script'] as const;
export type FixKind = (typeof FIX_KINDS)[number];

export type ContextGuard =
  | { kind: 'file_exists'; path: string }
  /** declared constraint of `package` in composer.json must lie within `satisfies`, or (notSatisfies) must neither lie within nor already admit the range */
  | { kind: 'composer_constraint'; package: string; satisfies?: string; notSatisfies?: string; section?: 'require' | 'require-dev' }
  | { kind: 'file_regex'; path: string; pattern: string; flags?: string; negate?: boolean };

export interface RuleFix {
  kind: FixKind;
  /** string values may contain ${var} placeholders filled from signature capture groups */
  params: Record<string, unknown>;
}

export interface Rule {
  key: string;
  category: RuleCategory;
  /** Laravel major this rule applies to as a string ("11", "12", "13"), or "any" */
  version: string;
  title: string;
  signature: string;
  contextGuard?: ContextGuard;
  fix: RuleFix;
  sources: string[];
  unverified?: boolean;
}

export interface Match {
  rule: Rule;
  /** named groups plus numbered groups ("1", "2", ...) */
  vars: Record<string, string>;
  /** offset of the match in the failure output (used for deterministic ordering) */
  index: number;
}

export interface FixPlan {
  ruleKey: string;
  /** false when the context guard or file preconditions did not hold */
  applicable: boolean;
  reason?: string;
  /** files changed in the VirtualFs by a pure TS fix */
  changedFiles: string[];
  /** steps the sandbox must run (rector, php parser) */
  externalSteps: ExternalStep[];
}

export type VerifyStage = 'composer' | 'build' | 'tests' | 'larastan';
export interface VerifyResult { passed: boolean; output: string; stage: VerifyStage }

export interface CommitDescriptor { message: string; changedFiles: string[]; externalSteps: ExternalStep[] }

export interface LoopRecord {
  loop: number;
  verify: { stage: VerifyStage; passed: boolean; signature: string };
  matchedKeys: string[];
  appliedKeys: string[];
  skippedKeys: string[];
  commit?: CommitDescriptor;
}

export type StopReason = 'passed' | 'max_loops' | 'no_rule_matches' | 'all_matches_already_applied' | 'no_effective_change';

export interface RepairOutcome {
  passed: boolean;
  stopReason: StopReason;
  loops: LoopRecord[];
  appliedRuleKeys: string[];
  commits: CommitDescriptor[];
  finalVerify: VerifyResult;
  squawks: Squawk[];
  /** normalised signatures of failures no rule could handle, for the weekly review */
  unmatchedSignatures: string[];
}
