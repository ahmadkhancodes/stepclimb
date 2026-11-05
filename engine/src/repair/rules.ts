import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import semver from 'semver';
import type { VirtualFs } from '../vfs.js';
import { validateRule } from './schema.js';
import type { ContextGuard, Match, Rule } from './types.js';

export class RuleLoadError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Invalid repair rules:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }
}

/** The only I/O in the repair module: read every *.yaml / *.yml in `dir`. A file may hold one rule or a list of rules. */
export function loadRules(dir: string): Rule[] {
  const files = readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort();
  const rules: Rule[] = [];
  const errors: string[] = [];
  const seen = new Map<string, string>();
  for (const f of files) {
    let doc: unknown;
    try { doc = parseYaml(readFileSync(join(dir, f), 'utf8')); } catch (e) { errors.push(`${f}: YAML parse error: ${(e as Error).message}`); continue; }
    const items = Array.isArray(doc) ? doc : [doc];
    items.forEach((raw, i) => {
      const res = validateRule(raw, Array.isArray(doc) ? `${f}[${i}]` : f);
      if (!res.ok) { errors.push(...res.errors); return; }
      const prev = seen.get(res.rule.key);
      if (prev) { errors.push(`${f}: duplicate rule key "${res.rule.key}" (also in ${prev})`); return; }
      seen.set(res.rule.key, f);
      rules.push(res.rule);
    });
  }
  if (errors.length) throw new RuleLoadError(errors);
  return rules.sort((a, b) => a.key.localeCompare(b.key));
}

export { validateRule };

/** Composer constraint -> semver range ("^3.3|^4.0" -> "^3.3 || ^4.0"). */
export function toSemverRange(c: string): string {
  return c.trim().replace(/@\w+/g, '').replace(/\s*\|\|?\s*/g, ' || ').replace(/\s*,\s*/g, ' ');
}

function withinRange(declared: string, range: string): boolean {
  try { return semver.subset(toSemverRange(declared), toSemverRange(range)); } catch { return false; }
}

export function readComposerJson(fs: VirtualFs): Record<string, unknown> | undefined {
  const raw = fs.read('composer.json');
  if (raw === undefined) return undefined;
  try { const v = JSON.parse(raw); return v && typeof v === 'object' ? v as Record<string, unknown> : undefined; } catch { return undefined; }
}

export function evalGuard(guard: ContextGuard | undefined, fs: VirtualFs): { ok: boolean; reason?: string } {
  if (!guard) return { ok: true };
  switch (guard.kind) {
    case 'file_exists':
      return fs.exists(guard.path) ? { ok: true } : { ok: false, reason: `guard: ${guard.path} does not exist` };
    case 'file_regex': {
      const content = fs.read(guard.path);
      if (content === undefined) return { ok: false, reason: `guard: ${guard.path} does not exist` };
      const hit = new RegExp(guard.pattern, guard.flags ?? 'm').test(content);
      return hit !== (guard.negate === true) ? { ok: true } : { ok: false, reason: `guard: pattern ${guard.negate ? 'unexpectedly found in' : 'not found in'} ${guard.path}` };
    }
    case 'composer_constraint': {
      const json = readComposerJson(fs);
      if (!json) return { ok: false, reason: 'guard: composer.json missing or invalid' };
      const sections = guard.section ? [guard.section] : ['require', 'require-dev'];
      let declared: string | undefined;
      for (const s of sections) {
        const sec = json[s];
        if (sec && typeof sec === 'object' && typeof (sec as Record<string, unknown>)[guard.package] === 'string') {
          declared = (sec as Record<string, string>)[guard.package];
          break;
        }
      }
      if (declared === undefined) return { ok: false, reason: `guard: ${guard.package} not declared in composer.json` };
      if (guard.satisfies !== undefined) return withinRange(declared, guard.satisfies) ? { ok: true } : { ok: false, reason: `guard: ${guard.package} ${declared} is not within ${guard.satisfies}` };
      // fire only when no alternative ("^3.3 || ^4.0") of the declared constraint already lies within the target range
      const target = guard.notSatisfies ?? '';
      return toSemverRange(declared).split('||').some((alt) => withinRange(alt.trim(), target))
        ? { ok: false, reason: `guard: ${guard.package} ${declared} already compatible with ${target}` }
        : { ok: true };
    }
  }
}

export interface MatchOptions {
  /** only rules whose version is "any" or equals this Laravel major */
  targetMajor?: number;
  /** when given, context guards are evaluated and failing rules dropped */
  fs?: VirtualFs;
}

/** Deterministic: sorted by position in the output, then rule key. One match per rule (first occurrence). */
export function matchFailure(output: string, rules: Rule[], opts: MatchOptions = {}): Match[] {
  const matches: Match[] = [];
  for (const rule of rules) {
    if (opts.targetMajor !== undefined && rule.version !== 'any' && rule.version !== String(opts.targetMajor)) continue;
    const m = new RegExp(rule.signature, 'm').exec(output);
    if (!m) continue;
    if (opts.fs && !evalGuard(rule.contextGuard, opts.fs).ok) continue;
    const vars: Record<string, string> = {};
    m.forEach((g, i) => { if (i > 0 && g !== undefined) vars[String(i)] = g; });
    for (const [k, v] of Object.entries(m.groups ?? {})) if (v !== undefined) vars[k] = v;
    matches.push({ rule, vars, index: m.index });
  }
  return matches.sort((a, b) => a.index - b.index || a.rule.key.localeCompare(b.rule.key));
}
