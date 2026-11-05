import semver from 'semver';
import { ENGINES, PATH_KINDS, type Recipe } from './types.js';

export type ValidationResult = { ok: true; recipe: Recipe } | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

export function validateRecipe(obj: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(obj)) return { ok: false, errors: ['recipe must be a mapping'] };
  const str = (k: string) => {
    const v = obj[k];
    if (typeof v !== 'string' || v.trim() === '') errors.push(`${k}: required non empty string`);
    return typeof v === 'string' ? v : '';
  };
  const key = str('key');
  if (key && !/^[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?$/.test(key)) errors.push(`key: "${key}" must be lowercase letters, digits, dots and dashes`);
  const version = str('version');
  if (version && !semver.valid(version)) errors.push(`version: "${version}" is not valid semver`);
  const pathKind = str('pathKind');
  if (pathKind && !(PATH_KINDS as readonly string[]).includes(pathKind)) errors.push(`pathKind: "${pathKind}" must be one of ${PATH_KINDS.join(', ')}`);
  const engine = str('engine');
  if (engine && !(ENGINES as readonly string[]).includes(engine)) errors.push(`engine: "${engine}" must be one of ${ENGINES.join(', ')}`);
  const title = str('title');
  const summary = str('summary');
  const ver = (k: 'from' | 'to'): string => {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (typeof v === 'string' && v.trim() !== '') return v;
    errors.push(`${k}: required (number or string)`);
    return '';
  };
  const from = ver('from');
  const to = ver('to');
  if (!isObj(obj.params)) errors.push('params: required mapping');
  if (!isStrArr(obj.sources) || obj.sources.length === 0) errors.push('sources: required non empty list of URLs');
  else obj.sources.forEach((s, i) => { if (!/^https?:\/\//.test(s)) errors.push(`sources[${i}]: "${s}" is not a URL`); });
  if (obj.unverified !== undefined && typeof obj.unverified !== 'boolean') errors.push('unverified: must be boolean');
  if (obj.order !== undefined && typeof obj.order !== 'number') errors.push('order: must be a number');

  if (obj.guard !== undefined) {
    if (!isObj(obj.guard)) errors.push('guard: must be a mapping');
    else {
      const g = obj.guard;
      for (const k of ['requiresFiles', 'requiresPackages', 'testFramework', 'frontendStack']) {
        if (g[k] !== undefined && !isStrArr(g[k])) errors.push(`guard.${k}: must be a list of strings`);
      }
      if (g.composer !== undefined) {
        if (!isObj(g.composer)) errors.push('guard.composer: must be a mapping package -> range');
        else for (const [p, r] of Object.entries(g.composer)) if (typeof r !== 'string' || !semver.validRange(normalizeRange(r))) errors.push(`guard.composer.${p}: invalid range`);
      }
      for (const k of Object.keys(g)) if (!['requiresFiles', 'requiresPackages', 'composer', 'testFramework', 'frontendStack'].includes(k)) errors.push(`guard.${k}: unknown guard key`);
    }
  }

  if (isObj(obj.params)) errors.push(...validateParams(engine, obj.params, obj.unverified === true));
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    recipe: {
      key, version, pathKind: pathKind as Recipe['pathKind'], from, to, engine: engine as Recipe['engine'], title, summary,
      guard: obj.guard as Recipe['guard'], unverified: obj.unverified === true ? true : undefined,
      order: obj.order as number | undefined, params: obj.params as Record<string, unknown>, sources: obj.sources as string[],
    },
  };
}

/** Composer constraint -> node-semver range. Handles `|`, `,` and spaces. Returns the input when it cannot be translated. */
export function normalizeRange(c: string): string {
  return c.trim().replace(/\s*,\s*/g, ' ').replace(/(?<!\|)\|(?!\|)/g, '||').replace(/\s*\|\|\s*/g, ' || ').replace(/@(dev|stable|beta|alpha|RC)$/i, '');
}

function validateParams(engine: string, p: Record<string, unknown>, unverified: boolean): string[] {
  const e: string[] = [];
  const list = (k: string) => {
    const v = p[k];
    if (v === undefined) return [] as unknown[];
    if (!Array.isArray(v)) { e.push(`params.${k}: must be a list`); return [] as unknown[]; }
    return v;
  };
  switch (engine) {
    case 'composer_json': {
      if (p.php !== undefined) {
        if (!isObj(p.php) || typeof p.php.min !== 'string' || !/^\d+\.\d+(\.\d+)?$/.test(p.php.min)) e.push('params.php.min: required like "8.2"');
      }
      list('packages').forEach((x, i) => {
        if (!isObj(x) || typeof x.name !== 'string') return void e.push(`params.packages[${i}].name: required`);
        if (x.constraint === undefined && x.unverified !== true) e.push(`params.packages[${i}] (${x.name}): constraint required unless unverified: true`);
        if (x.constraint !== undefined && (typeof x.constraint !== 'string' || !semver.validRange(normalizeRange(x.constraint)))) e.push(`params.packages[${i}] (${x.name}): invalid constraint`);
        if (x.section !== undefined && !['require', 'require-dev', 'both'].includes(x.section as string)) e.push(`params.packages[${i}].section: require | require-dev | both`);
      });
      list('remove').forEach((x, i) => { if (!isObj(x) || typeof x.name !== 'string') e.push(`params.remove[${i}].name: required`); });
      list('replace').forEach((x, i) => {
        if (!isObj(x) || typeof x.from !== 'string' || typeof x.to !== 'string' || typeof x.constraint !== 'string') e.push(`params.replace[${i}]: from, to, constraint required`);
      });
      if (!p.php && !p.packages && !p.remove && !p.replace) e.push('params: composer_json needs php, packages, remove or replace');
      break;
    }
    case 'file_patch':
      list('files').forEach((f, i) => {
        if (!isObj(f) || typeof f.path !== 'string' || !Array.isArray(f.replacements)) return void e.push(`params.files[${i}]: path and replacements required`);
        f.replacements.forEach((r: unknown, j: number) => {
          if (!isObj(r) || typeof r.find !== 'string' || typeof r.replace !== 'string') return void e.push(`params.files[${i}].replacements[${j}]: find and replace required`);
          if (r.type !== undefined && r.type !== 'exact' && r.type !== 'regex') e.push(`params.files[${i}].replacements[${j}].type: exact | regex`);
          if (r.type === 'regex') { try { new RegExp(r.find, typeof r.flags === 'string' ? r.flags : 'g'); } catch { e.push(`params.files[${i}].replacements[${j}]: invalid regex`); } }
        });
      });
      if (!Array.isArray(p.files) || (p.files.length === 0 && !unverified)) e.push('params.files: required non empty list (or recipe unverified)');
      break;
    case 'skeleton_diff':
      if (!isStrArr(p.files) || p.files.length === 0) e.push('params.files: required non empty list of paths');
      break;
    case 'rector':
      if (p.rules !== undefined && !isStrArr(p.rules)) e.push('params.rules: list of fully qualified rule classes');
      if (p.sets !== undefined && !isStrArr(p.sets)) e.push('params.sets: list of strings');
      if (!(isStrArr(p.rules) && p.rules.length) && !(isStrArr(p.sets) && p.sets.length)) e.push('params: rector needs rules or sets');
      break;
    case 'php_parser':
      if (typeof p.script !== 'string' || !p.script.trim()) e.push('params.script: required PHP script body');
      break;
    case 'npm_codemod':
      if (typeof p.package !== 'string') e.push('params.package: required');
      break;
  }
  return e;
}
