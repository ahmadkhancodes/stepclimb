import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { validateRecipe } from './validate';
import type { Recipe } from './types';

export class RecipeLoadError extends Error {
  constructor(public readonly problems: { file: string; errors: string[] }[]) {
    super('Invalid recipes:\n' + problems.map((p) => `  ${p.file}\n    - ${p.errors.join('\n    - ')}`).join('\n'));
  }
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.ya?ml$/.test(name)) out.push(p);
  }
}

/** Reads every *.yaml under dir (recursive), validates, and returns recipes sorted by key then version. Throws RecipeLoadError listing every problem. */
export function loadRecipes(dir: string): Recipe[] {
  const files: string[] = [];
  walk(dir, files);
  const recipes: Recipe[] = [];
  const problems: { file: string; errors: string[] }[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    let doc: unknown;
    try { doc = YAML.parse(readFileSync(f, 'utf8')); } catch (err) { problems.push({ file: f, errors: [`YAML parse error: ${(err as Error).message}`] }); continue; }
    const r = validateRecipe(doc);
    if (!r.ok) { problems.push({ file: f, errors: r.errors }); continue; }
    const id = `${r.recipe.key}@${r.recipe.version}`;
    if (seen.has(id)) { problems.push({ file: f, errors: [`duplicate recipe ${id}`] }); continue; }
    seen.add(id);
    recipes.push(r.recipe);
  }
  if (problems.length) throw new RecipeLoadError(problems);
  return recipes.sort((a, b) => a.key.localeCompare(b.key) || a.version.localeCompare(b.version, undefined, { numeric: true }));
}
