import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Honest proof for the landing page (skill A2, B8): counts read from the shipped recipe and repair rule
// files at build time, never typed in by hand. No testimonials or customer numbers until real ones exist.
function yamlFiles(dir: string): string[] {
  try {
    return readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? yamlFiles(p) : /\.ya?ml$/.test(n) ? [p] : [];
    });
  } catch {
    return [];
  }
}

export function proofFacts(root = process.cwd()) {
  const recipes = yamlFiles(join(root, "recipes"));
  const paths = new Set(recipes.filter((f) => f.includes(join("recipes", "laravel"))).map((f) => f.split(/[\\/]/).at(-2)));
  return { recipes: recipes.length, upgradePaths: paths.size, repairRules: yamlFiles(join(root, "repair-rules")).length };
}
