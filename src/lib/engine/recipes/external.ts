import type { ExternalStep } from '../types';
import { docUrlOf, empty, withPrefix, type Engine } from './engine-types';
import { makeSquawk } from './squawk';

const phpStr = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const cls = (s: string) => `\\${s.replace(/^\\+/, '')}::class`;

/** Generates the rector.php the sandbox writes before running rector. Pure string building. */
export function buildRectorConfig(params: { paths?: string[]; rules?: string[]; sets?: string[] }): string {
  const paths = params.paths ?? ['app', 'bootstrap', 'config', 'database', 'routes', 'tests'];
  const lines = ['<?php', '', 'declare(strict_types=1);', '', 'use Rector\\Config\\RectorConfig;', '', 'return RectorConfig::configure()'];
  lines.push(`    ->withPaths([${paths.map(phpStr).join(', ')}])`);
  if (params.sets?.length) lines.push(`    ->withSets([${params.sets.map(cls).join(', ')}])`);
  if (params.rules?.length) lines.push(`    ->withRules([${params.rules.map(cls).join(', ')}])`);
  lines[lines.length - 1] += ';';
  return lines.join('\n') + '\n';
}

const unverifiedOut = (recipe: Parameters<Engine>[0]) => {
  const out = empty();
  out.squawks.push(makeSquawk({ severity: 'review', title: `Review manually: ${recipe.title}`, body: `${recipe.summary}\nStepclimb has not verified this transformation against an official source, so the sandbox step was not scheduled.`, docUrl: docUrlOf(recipe) }));
  return out;
};

export const applyRector: Engine = (recipe, _fs, ctx) => {
  if (recipe.unverified) return unverifiedOut(recipe);
  const out = empty();
  const cfgPath = '.stepclimb/rector.php';
  const p = recipe.params as { paths?: string[]; rules?: string[]; sets?: string[]; packages?: string[] };
  const cwd = ctx.appPath || undefined;
  const steps: ExternalStep[] = [];
  steps.push({ kind: 'composer', id: `${recipe.key}.require`, cwd, command: ['composer', 'require', '--dev', '--no-interaction', '--no-scripts', ...(p.packages ?? ['rector/rector', 'driftingly/rector-laravel'])] });
  steps.push({ kind: 'rector', id: recipe.key, cwd, command: ['vendor/bin/rector', 'process', '--config', cfgPath, '--no-progress-bar', '--no-diffs', '--ansi'], files: { [withPrefix(ctx, cfgPath)]: buildRectorConfig(p) } });
  out.externalSteps = steps;
  return out;
};

export const applyPhpParser: Engine = (recipe, _fs, ctx) => {
  if (recipe.unverified) return unverifiedOut(recipe);
  const out = empty();
  const scriptPath = (recipe.params.scriptPath as string | undefined) ?? `.stepclimb/${recipe.key}.php`;
  out.externalSteps = [{ kind: 'php_parser', id: recipe.key, cwd: ctx.appPath || undefined, command: ['php', scriptPath, ...((recipe.params.args as string[] | undefined) ?? [])], files: { [withPrefix(ctx, scriptPath)]: recipe.params.script as string } }];
  return out;
};

export const applyNpmCodemod: Engine = (recipe, _fs, ctx) => {
  if (recipe.unverified) return unverifiedOut(recipe);
  const out = empty();
  const p = recipe.params as { package: string; version?: string; args?: string[] };
  const spec = p.version ? `${p.package}@${p.version}` : p.package;
  out.externalSteps = [{ kind: 'npm_codemod', id: recipe.key, cwd: ctx.appPath || undefined, command: ['npx', '--yes', spec, ...(p.args ?? [])] }];
  return out;
};
