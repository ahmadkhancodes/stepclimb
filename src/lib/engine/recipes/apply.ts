import type { RecipeResult } from '../types.js';
import type { VirtualFs } from '../vfs.js';
import { applyComposerJson, satisfiesTarget } from './composer.js';
import { empty, withPrefix, type Engine } from './engine-types.js';
import { applyNpmCodemod, applyPhpParser, applyRector } from './external.js';
import { applyFilePatch } from './patch.js';
import { applySkeletonDiff } from './skeleton.js';
import type { Recipe, RecipeContext } from './types.js';

const ENGINE_IMPLS: Record<Recipe['engine'], Engine> = {
  composer_json: applyComposerJson,
  skeleton_diff: applySkeletonDiff,
  file_patch: applyFilePatch,
  rector: applyRector,
  php_parser: applyPhpParser,
  npm_codemod: applyNpmCodemod,
};

export const commitMessageFor = (r: Pick<Recipe, 'key' | 'version' | 'title'>): string => `Stepclimb: ${r.key}@${r.version} ${r.title}`;

/** Reads composer.json require and require-dev merged, or undefined when missing or invalid. */
function readComposerPackages(fs: VirtualFs, ctx: RecipeContext): Record<string, string> | undefined {
  const t = fs.read(withPrefix(ctx, 'composer.json'));
  if (t === undefined) return undefined;
  try {
    const j = JSON.parse(t) as { require?: Record<string, string>; 'require-dev'?: Record<string, string> };
    return { ...(j['require-dev'] ?? {}), ...(j.require ?? {}) };
  } catch { return undefined; }
}

/** true when the repo state allows the recipe to run. */
export function guardPasses(recipe: Recipe, fs: VirtualFs, ctx: RecipeContext): boolean {
  const g = recipe.guard;
  if (!g) return true;
  if (g.requiresFiles?.some((f) => !fs.exists(withPrefix(ctx, f)))) return false;
  if (g.requiresPackages || g.composer) {
    const pk = readComposerPackages(fs, ctx);
    if (!pk) return false;
    if (g.requiresPackages?.some((n) => !(n in pk))) return false;
    for (const [n, range] of Object.entries(g.composer ?? {})) {
      const cur = pk[n];
      if (cur === undefined || !satisfiesTarget(cur, range)) return false;
    }
  }
  if (g.testFramework && ctx.app?.testFramework && !g.testFramework.includes(ctx.app.testFramework)) return false;
  if (g.frontendStack && ctx.app?.frontendStack && !g.frontendStack.includes(ctx.app.frontendStack)) return false;
  return true;
}

/** Applies one recipe to the virtual fs. Pure apart from writes to `fs`. Re-applying yields noop: true. */
export function applyRecipe(recipe: Recipe, fs: VirtualFs, ctx: RecipeContext = {}): RecipeResult {
  const base = { recipeKey: recipe.key, recipeVersion: recipe.version, commitMessage: commitMessageFor(recipe) };
  if (!guardPasses(recipe, fs, ctx)) return { ...base, ...empty(), noop: true };
  const o = ENGINE_IMPLS[recipe.engine](recipe, fs, ctx);
  const changedFiles = [...new Set(o.changedFiles)].sort();
  return { ...base, changedFiles, squawks: o.squawks, externalSteps: o.externalSteps, noop: changedFiles.length === 0 && o.externalSteps.length === 0 };
}

/** Applies recipes in order; each sees the previous recipe's writes. */
export function runPlan(recipes: Recipe[], fs: VirtualFs, ctx: RecipeContext = {}): RecipeResult[] {
  return recipes.map((r) => applyRecipe(r, fs, ctx));
}
