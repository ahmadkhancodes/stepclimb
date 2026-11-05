import { FIX_KINDS, RULE_CATEGORIES, type ContextGuard, type Rule } from './types.js';

export type ValidationResult = { ok: true; rule: Rule } | { ok: false; errors: string[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Hand written validator. Errors are prefixed with the field path so authors can fix the YAML quickly. */
export function validateRule(raw: unknown, source = 'rule'): ValidationResult {
  const errors: string[] = [];
  const err = (path: string, msg: string) => errors.push(`${source}: ${path}: ${msg}`);
  if (!isObj(raw)) return { ok: false, errors: [`${source}: must be a mapping, got ${Array.isArray(raw) ? 'array' : typeof raw}`] };

  const known = new Set(['key', 'category', 'version', 'title', 'signature', 'contextGuard', 'fix', 'sources', 'unverified']);
  for (const k of Object.keys(raw)) if (!known.has(k)) err(k, `unknown field (allowed: ${[...known].join(', ')})`);

  const str = (k: string): string | undefined => {
    const v = raw[k];
    if (typeof v !== 'string' || v.trim() === '') { err(k, 'required non-empty string'); return undefined; }
    return v;
  };

  const key = str('key');
  const category = str('category');
  const version = raw.version === undefined ? undefined : String(raw.version);
  if (version === undefined || !/^(?:any|\d{1,2})$/.test(version)) err('version', 'required: Laravel major as "11" | "12" | "13" or "any"');
  const title = str('title');
  const signature = str('signature');

  if (category !== undefined && !(RULE_CATEGORIES as readonly string[]).includes(category))
    err('category', `must be one of ${RULE_CATEGORIES.join('|')}, got "${category}"`);
  if (key !== undefined) {
    if (!/^[a-z]+\.[a-z0-9]+(?:-[a-z0-9]+)*$/.test(key)) err('key', `"${key}" must look like category.kebab-name`);
    else if (category && key.split('.')[0] !== category) err('key', `prefix of "${key}" must equal category "${category}"`);
  }
  if (signature !== undefined) {
    try { new RegExp(signature, 'm'); } catch (e) { err('signature', `invalid regex: ${(e as Error).message}`); }
  }

  let guard: ContextGuard | undefined;
  if (raw.contextGuard !== undefined) guard = validateGuard(raw.contextGuard, err);

  let fix: Rule['fix'] | undefined;
  if (!isObj(raw.fix)) err('fix', 'required mapping {kind, params}');
  else {
    const kind = raw.fix.kind;
    if (typeof kind !== 'string' || !(FIX_KINDS as readonly string[]).includes(kind)) err('fix.kind', `must be one of ${FIX_KINDS.join('|')}`);
    else if (!isObj(raw.fix.params)) err('fix.params', 'required mapping');
    else {
      const before = errors.length;
      validateParams(kind, raw.fix.params, (p, m) => err(`fix.params.${p}`, m));
      if (errors.length === before) fix = { kind: kind as Rule['fix']['kind'], params: raw.fix.params };
    }
  }

  const sources: string[] = [];
  if (!Array.isArray(raw.sources) || raw.sources.length === 0) err('sources', 'required non-empty list of documentation URLs');
  else {
    raw.sources.forEach((s, i) => {
      if (typeof s !== 'string' || !/^https:\/\/\S+$/.test(s)) err(`sources[${i}]`, 'must be an https URL');
      else sources.push(s);
    });
  }
  if (raw.unverified !== undefined && typeof raw.unverified !== 'boolean') err('unverified', 'must be boolean');

  if (errors.length > 0 || !key || !category || !title || !signature || !fix || version === undefined) return { ok: false, errors };
  const rule: Rule = {
    key, category: category as Rule['category'], version, title, signature, fix, sources,
    ...(guard ? { contextGuard: guard } : {}),
    ...(raw.unverified === undefined ? {} : { unverified: raw.unverified as boolean }),
  };
  return { ok: true, rule };
}

function validateGuard(g: unknown, err: (p: string, m: string) => void): ContextGuard | undefined {
  if (!isObj(g)) { err('contextGuard', 'must be a mapping'); return undefined; }
  switch (g.kind) {
    case 'file_exists':
      if (typeof g.path !== 'string' || !g.path) { err('contextGuard.path', 'required string'); return undefined; }
      return { kind: 'file_exists', path: g.path };
    case 'composer_constraint': {
      if (typeof g.package !== 'string' || !g.package) { err('contextGuard.package', 'required string'); return undefined; }
      const hasS = typeof g.satisfies === 'string', hasN = typeof g.notSatisfies === 'string';
      if (hasS === hasN) { err('contextGuard', 'exactly one of satisfies | notSatisfies (string) is required'); return undefined; }
      if (g.section !== undefined && g.section !== 'require' && g.section !== 'require-dev') { err('contextGuard.section', 'require | require-dev'); return undefined; }
      return {
        kind: 'composer_constraint', package: g.package,
        ...(hasS ? { satisfies: g.satisfies as string } : { notSatisfies: g.notSatisfies as string }),
        ...(g.section ? { section: g.section as 'require' | 'require-dev' } : {}),
      };
    }
    case 'file_regex':
      if (typeof g.path !== 'string' || !g.path) { err('contextGuard.path', 'required string'); return undefined; }
      if (typeof g.pattern !== 'string') { err('contextGuard.pattern', 'required string'); return undefined; }
      try { new RegExp(g.pattern, typeof g.flags === 'string' ? g.flags : ''); } catch (e) { err('contextGuard.pattern', `invalid regex: ${(e as Error).message}`); return undefined; }
      return {
        kind: 'file_regex', path: g.path, pattern: g.pattern,
        ...(typeof g.flags === 'string' ? { flags: g.flags } : {}),
        ...(g.negate === true ? { negate: true } : {}),
      };
    default:
      err('contextGuard.kind', 'must be file_exists | composer_constraint | file_regex');
      return undefined;
  }
}

function validateParams(kind: string, p: Record<string, unknown>, err: (path: string, msg: string) => void): void {
  const needStr = (k: string) => { if (typeof p[k] !== 'string' || !p[k]) err(k, 'required string'); };
  switch (kind) {
    case 'composer_constraint':
      needStr('package');
      if (p.remove !== true) needStr('constraint');
      if (p.section !== undefined && p.section !== 'require' && p.section !== 'require-dev') err('section', 'require | require-dev');
      break;
    case 'config_patch':
      needStr('file');
      if (!Array.isArray(p.replace) || p.replace.length === 0) err('replace', 'required non-empty list of {pattern, replacement, flags?}');
      else p.replace.forEach((r, i) => {
        if (!isObj(r) || typeof r.pattern !== 'string' || typeof r.replacement !== 'string') return err(`replace[${i}]`, 'needs string pattern and replacement');
        try { new RegExp(r.pattern, typeof r.flags === 'string' ? r.flags : 'g'); } catch (e) { err(`replace[${i}].pattern`, `invalid regex: ${(e as Error).message}`); }
      });
      break;
    case 'file_template':
      needStr('path');
      if (typeof p.content !== 'string') err('content', 'required string');
      break;
    case 'rector_rule':
      needStr('rule');
      if (p.config !== undefined && !isObj(p.config) && !Array.isArray(p.config)) err('config', 'mapping or list');
      if (p.paths !== undefined && !(Array.isArray(p.paths) && p.paths.every((x) => typeof x === 'string'))) err('paths', 'list of strings');
      break;
    case 'php_parser_script':
      needStr('id');
      needStr('script');
      if (p.paths !== undefined && !(Array.isArray(p.paths) && p.paths.every((x) => typeof x === 'string'))) err('paths', 'list of strings');
      break;
  }
}
