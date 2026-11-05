import semver from 'semver';
import { ENGINES, type AppLike, type Recipe } from './types';

export class PlanError extends Error {}
export interface Hop { from: number; to: number; recipes: Recipe[] }
export interface PlanOptions { pathKind?: Recipe['pathKind'] }

const rank = (e: Recipe['engine']) => ENGINES.indexOf(e);

function latestPerKey(recipes: Recipe[]): Recipe[] {
  const m = new Map<string, Recipe>();
  for (const r of recipes) {
    const cur = m.get(r.key);
    if (!cur || semver.gt(r.version, cur.version)) m.set(r.key, r);
  }
  return [...m.values()];
}

function appliesTo(r: Recipe, app: AppLike): boolean {
  const g = r.guard;
  if (!g) return true;
  if (g.testFramework && app.testFramework && !g.testFramework.includes(app.testFramework)) return false;
  if (g.frontendStack && app.frontendStack && !g.frontendStack.includes(app.frontendStack)) return false;
  return true;
}

/** One hop per major step (10 -> 13 is 10->11, 11->12, 12->13), each with its recipes ordered composer first. Throws PlanError when a hop has no recipes. */
export function planHops(app: AppLike, from: number, to: number, catalog: Recipe[], opts: PlanOptions = {}): Hop[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || to <= from) throw new PlanError(`invalid hop range ${from} -> ${to}`);
  const kind = opts.pathKind ?? 'laravel';
  const pool = latestPerKey(catalog.filter((r) => r.pathKind === kind));
  const hops: Hop[] = [];
  for (let v = from; v < to; v++) {
    const recipes = pool
      .filter((r) => Number(r.from) === v && Number(r.to) === v + 1 && appliesTo(r, app))
      .sort((a, b) => (a.order ?? rank(a.engine) * 10) - (b.order ?? rank(b.engine) * 10) || a.key.localeCompare(b.key));
    if (!recipes.some((r) => r.engine === 'composer_json')) throw new PlanError(`no composer_json recipe for ${kind} ${v} -> ${v + 1}`);
    hops.push({ from: v, to: v + 1, recipes });
  }
  return hops;
}

/** Flat ordered recipe list for from -> to; each recipe carries its own from/to so hops stay visible. */
export function planHop(app: AppLike, from: number, to: number, catalog: Recipe[], opts: PlanOptions = {}): Recipe[] {
  return planHops(app, from, to, catalog, opts).flatMap((h) => h.recipes);
}
