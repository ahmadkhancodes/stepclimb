import type { ExternalStep } from '../types';
import type { VirtualFs } from '../vfs';
import { evalGuard, readComposerJson } from './rules';
import type { FixPlan, Match } from './types';

/** Replace ${name} placeholders (deeply) with capture group values; unknown names are left as is. */
export function expandParams<T>(value: T, vars: Record<string, string>): T {
  if (typeof value === 'string') return value.replace(/\$\{([A-Za-z0-9_]+)\}/g, (m, n: string) => vars[n] ?? m) as T;
  if (Array.isArray(value)) return value.map((v) => expandParams(v, vars)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [expandParams(k, vars), expandParams(v, vars)])) as T;
  }
  return value;
}

type P = Record<string, unknown>;
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Files a fix reads or writes; used by the loop guard (rule key + content hash of these files). */
export function fixTargets(match: Match, fs: VirtualFs): string[] {
  const p = expandParams(match.rule.fix.params, match.vars) as P;
  switch (match.rule.fix.kind) {
    case 'composer_constraint': return [typeof p.file === 'string' ? p.file : 'composer.json'];
    case 'config_patch': return [String(p.file)];
    case 'file_template': return [String(p.path)];
    case 'rector_rule':
    case 'php_parser_script': {
      const paths = strList(p.paths);
      const all = paths.length ? paths.flatMap((x) => fs.list(x)) : fs.list();
      return [...new Set(all)].sort();
    }
  }
}

export function planFix(match: Match, fs: VirtualFs): FixPlan {
  const { rule } = match;
  const base: FixPlan = { ruleKey: rule.key, applicable: true, changedFiles: [], externalSteps: [] };
  const na = (reason: string): FixPlan => ({ ...base, applicable: false, reason });
  const guard = evalGuard(rule.contextGuard, fs);
  if (!guard.ok) return na(guard.reason ?? 'context guard failed');
  const p = expandParams(rule.fix.params, match.vars) as P;

  switch (rule.fix.kind) {
    case 'composer_constraint': return composerConstraint(p, fs, base, na);
    case 'config_patch': {
      const file = String(p.file);
      const src = fs.read(file);
      if (src === undefined) return na(`${file} does not exist`);
      let out = src;
      for (const r of p.replace as Array<{ pattern: string; replacement: string; flags?: string }>) {
        // function replacer so "$" in replacements is literal
        out = out.replace(new RegExp(r.pattern, r.flags ?? 'g'), () => r.replacement);
      }
      if (out !== src) { fs.write(file, out); return { ...base, changedFiles: [file] }; }
      return { ...base, reason: 'no change (patch already applied or pattern absent)' };
    }
    case 'file_template': {
      const path = String(p.path);
      const content = String(p.content);
      const cur = fs.read(path);
      if (cur === content) return { ...base, reason: 'already up to date' };
      if (cur !== undefined && p.overwrite !== true) return na(`${path} exists and overwrite is not set`);
      fs.write(path, content);
      return { ...base, changedFiles: [path] };
    }
    case 'rector_rule': return { ...base, externalSteps: [rectorStep(rule.key, p)] };
    case 'php_parser_script': {
      const id = String(p.id);
      const file = `.stepclimb/repair/${id}.php`;
      const step: ExternalStep = {
        kind: 'php_parser', id: `repair-${rule.key}`,
        command: ['php', file, ...(strList(p.paths).length ? strList(p.paths) : ['.'])],
        files: { [file]: String(p.script) },
      };
      return { ...base, externalSteps: [step] };
    }
  }
}

function composerConstraint(p: P, fs: VirtualFs, base: FixPlan, na: (r: string) => FixPlan): FixPlan {
  const file = typeof p.file === 'string' ? p.file : 'composer.json';
  const raw = fs.read(file);
  if (raw === undefined) return na(`${file} does not exist`);
  const json = file === 'composer.json' ? readComposerJson(fs) : safeParse(raw);
  if (!json) return na(`${file} is not valid JSON`);
  const pkg = String(p.package);
  const sec = (name: string): Record<string, string> | undefined => {
    const v = json[name];
    return v && typeof v === 'object' ? v as Record<string, string> : undefined;
  };
  let changed = false;
  if (p.remove === true) {
    for (const name of p.section ? [String(p.section)] : ['require', 'require-dev']) {
      const s = sec(name);
      if (s && pkg in s) { delete s[pkg]; changed = true; }
    }
  } else {
    const section = typeof p.section === 'string' ? p.section : sec('require')?.[pkg] !== undefined || pkg === 'php' ? 'require' : sec('require-dev')?.[pkg] !== undefined ? 'require-dev' : undefined;
    if (!section && p.add !== true) return na(`${pkg} is not declared in ${file}`);
    const target = section ?? 'require';
    const s = sec(target) ?? (json[target] = {} as Record<string, string>) as Record<string, string>;
    if (s[pkg] !== String(p.constraint)) { s[pkg] = String(p.constraint); changed = true; }
  }
  if (!changed) return { ...base, reason: 'no change (already satisfied)' };
  const indent = /^([ \t]+)"/m.exec(raw)?.[1] ?? '    ';
  let out = JSON.stringify(json, null, indent);
  if (raw.includes('\\/')) out = out.replace(/\//g, '\\/');
  if (raw.endsWith('\n')) out += '\n';
  fs.write(file, out);
  return { ...base, changedFiles: [file] };
}

function safeParse(s: string): Record<string, unknown> | undefined {
  try { const v = JSON.parse(s); return v && typeof v === 'object' ? v : undefined; } catch { return undefined; }
}

const php = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
function phpValue(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(phpValue).join(', ')}]`;
  if (v && typeof v === 'object') return `[${Object.entries(v).map(([k, x]) => `${php(k)} => ${phpValue(x)}`).join(', ')}]`;
  if (typeof v === 'string') return php(v);
  return String(v);
}

function rectorStep(ruleKey: string, p: P): ExternalStep {
  const paths = strList(p.paths).length ? strList(p.paths) : ['app', 'bootstrap', 'config', 'database', 'routes', 'tests'];
  const cls = String(p.rule).replace(/^\\+/, '');
  const configured = p.config !== undefined;
  const cfgFile = 'rector.stepclimb-repair.php';
  const body = [
    '<?php',
    'declare(strict_types=1);',
    '',
    'use Rector\\Config\\RectorConfig;',
    '',
    'return RectorConfig::configure()',
    `    ->withPaths(${phpValue(paths)})`,
    configured ? `    ->withConfiguredRule(\\${cls}::class, ${phpValue(p.config)});` : `    ->withRules([\\${cls}::class]);`,
    '',
  ].join('\n');
  return {
    kind: 'rector', id: `repair-${ruleKey}`,
    command: ['vendor/bin/rector', 'process', `--config=${cfgFile}`, '--no-progress-bar', '--no-diffs'],
    files: { [cfgFile]: body },
  };
}
