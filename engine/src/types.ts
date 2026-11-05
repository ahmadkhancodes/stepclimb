/** Shared contracts. Keep stable: detect, recipes and repair modules all import from here. */
export type TestFramework = 'pest' | 'phpunit' | 'none';
export type FrontendStack = 'blade' | 'livewire' | 'inertia_vue' | 'inertia_react' | 'api_only';
export type EffortBand = 'S' | 'M' | 'L' | 'XL';
export type Severity = 'must_fix' | 'review' | 'note';

export interface DetectedApp {
  /** repo relative dir of the composer.json, '' for root */
  path: string;
  isLaravel: boolean;
  /** exact installed version from composer.lock when available, else lowest version satisfying the constraint */
  laravelVersion: string | null;
  laravelMajor: number | null;
  laravelConstraint: string | null;
  phpConstraint: string | null;
  frontendStack: FrontendStack;
  tailwindVersion: string | null;
  livewireVersion: string | null;
  testFramework: TestFramework;
  usesVite: boolean;
  /** false => shown as "Not supported yet" */
  supported: boolean;
  unsupportedReason?: string;
}

export interface Squawk {
  severity: Severity;
  file?: string;
  line?: number;
  title: string;
  bodyMd: string;
  /** templated prompt for the customer's own agent; never produced by an AI call */
  agentPrompt: string;
}

/** A command the sandbox run agent must execute (the engine itself never spawns processes). */
export interface ExternalStep {
  kind: 'rector' | 'php_parser' | 'npm_codemod' | 'composer' | 'shell';
  /** stable id for logs and golden fixtures */
  id: string;
  cwd?: string;
  command: string[];
  /** rector config or script body to write before running, path -> content */
  files?: Record<string, string>;
}

export interface RecipeResult {
  recipeKey: string;
  recipeVersion: string;
  /** commit message, always `Stepclimb: <key>@<version>` plus a one line summary */
  commitMessage: string;
  changedFiles: string[];
  squawks: Squawk[];
  externalSteps: ExternalStep[];
  /** true when the recipe made no change (already applied or not applicable) */
  noop: boolean;
}
