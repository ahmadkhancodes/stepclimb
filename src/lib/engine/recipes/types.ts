import type { DetectedApp, RecipeResult } from '../types';

export const PATH_KINDS = ['laravel', 'fixer', 'slimmer', 'tailwind', 'livewire', 'pest', 'php', 'ci'] as const;
export type PathKind = (typeof PATH_KINDS)[number];
export const ENGINES = ['composer_json', 'skeleton_diff', 'file_patch', 'rector', 'php_parser', 'npm_codemod'] as const;
export type RecipeEngine = (typeof ENGINES)[number];

export interface RecipeGuard {
  /** repo files that must exist (relative to the app path) or the recipe is a noop */
  requiresFiles?: string[];
  /** composer packages (require or require-dev) that must be present */
  requiresPackages?: string[];
  /** package -> range; the lowest version allowed by the repo's constraint must satisfy it */
  composer?: Record<string, string>;
  /** plan time filters against DetectedApp */
  testFramework?: string[];
  frontendStack?: string[];
}

export interface Recipe {
  key: string;
  version: string;
  pathKind: PathKind;
  from: string;
  to: string;
  engine: RecipeEngine;
  title: string;
  summary: string;
  guard?: RecipeGuard;
  /** true: the facts were not verified against an official source; the engine emits a review squawk and changes nothing */
  unverified?: boolean;
  /** optional explicit ordering inside a hop (lower first); default is by engine */
  order?: number;
  params: Record<string, unknown>;
  sources: string[];
}

export type AppLike = Partial<Pick<DetectedApp, 'laravelMajor' | 'phpConstraint' | 'testFramework' | 'frontendStack' | 'laravelVersion' | 'livewireVersion' | 'tailwindVersion'>>;

export interface RecipeContext {
  /** repo relative dir of the app (composer.json dir), '' for root */
  appPath?: string;
  app?: AppLike;
  /** tagged laravel/laravel skeleton files, path -> content */
  skeleton?: { from: Record<string, string>; to: Record<string, string> };
}

export type { RecipeResult };
