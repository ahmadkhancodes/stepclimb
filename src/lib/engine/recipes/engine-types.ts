import type { ExternalStep, Squawk } from '../types';
import type { VirtualFs } from '../vfs';
import type { Recipe, RecipeContext } from './types';

export interface EngineOutput {
  changedFiles: string[];
  squawks: Squawk[];
  externalSteps: ExternalStep[];
}
export type Engine = (recipe: Recipe, fs: VirtualFs, ctx: RecipeContext) => EngineOutput;

export const withPrefix = (ctx: RecipeContext, p: string): string => {
  const base = (ctx.appPath ?? '').replace(/^\/+|\/+$/g, '');
  return base ? `${base}/${p}` : p;
};
export const docUrlOf = (r: Recipe): string => r.sources[0] ?? 'https://laravel.com/docs/master/upgrade';
export const empty = (): EngineOutput => ({ changedFiles: [], squawks: [], externalSteps: [] });
