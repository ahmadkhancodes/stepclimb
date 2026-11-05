import semver from 'semver';
import type { Severity } from '../types.js';
import { docUrlOf, empty, withPrefix, type Engine } from './engine-types.js';
import { makeSquawk } from './squawk.js';
import { normalizeRange } from './validate.js';

type Json = Record<string, unknown>;
const SECTIONS = ['require', 'require-dev'] as const;

/** Lowest version a composer constraint allows, or null when it cannot be determined (dev-main, aliases). */
export function minVersionOf(constraint: string): semver.SemVer | null {
  const r = semver.validRange(normalizeRange(constraint));
  if (!r) return null;
  try { return semver.minVersion(r); } catch { return null; }
}
/** true when the lowest version of `current` already satisfies `target`. */
export function satisfiesTarget(current: string, target: string): boolean {
  const min = minVersionOf(current);
  const t = semver.validRange(normalizeRange(target));
  return !!min && !!t && semver.satisfies(min, t);
}

interface Fmt { indent: string | number; eol: string; trailingNewline: boolean; escapeSlashes: boolean }
function detectFormat(text: string): Fmt {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const m = /^([ \t]+)"/m.exec(text);
  const indent = m ? (m[1]!.includes('\t') ? '\t' : m[1]!.length) : 4;
  return { indent, eol, trailingNewline: /\n$/.test(text), escapeSlashes: text.includes('\\/') };
}
function serialize(data: Json, f: Fmt): string {
  let out = JSON.stringify(data, null, f.indent);
  if (f.escapeSlashes) out = out.replace(/\//g, '\\/');
  if (f.eol !== '\n') out = out.replace(/\n/g, f.eol);
  return out + (f.trailingNewline ? f.eol : '');
}

interface PkgItem { name: string; constraint?: string; section?: 'require' | 'require-dev' | 'both'; unverified?: boolean; severity?: Severity; note?: { severity?: Severity; title: string; body: string } }

export const applyComposerJson: Engine = (recipe, fs, ctx) => {
  const out = empty();
  const path = withPrefix(ctx, 'composer.json');
  const doc = docUrlOf(recipe);
  const text = fs.read(path);
  if (text === undefined) {
    out.squawks.push(makeSquawk({ severity: 'must_fix', file: path, title: 'composer.json not found', body: `Recipe ${recipe.key} expected ${path}.`, docUrl: doc }));
    return out;
  }
  let data: Json;
  try { data = JSON.parse(text) as Json; } catch (e) {
    out.squawks.push(makeSquawk({ severity: 'must_fix', file: path, title: 'composer.json is not valid JSON', body: `Could not parse ${path}: ${(e as Error).message}`, docUrl: doc }));
    return out;
  }
  const fmt = detectFormat(text);
  let changed = false;
  const p = recipe.params as { php?: { min: string; unverified?: boolean }; packages?: PkgItem[]; remove?: { name: string; optional?: boolean; note?: PkgItem['note'] }[]; replace?: { from: string; to: string; constraint: string }[] };
  const sec = (s: (typeof SECTIONS)[number]) => (data[s] && typeof data[s] === 'object' ? (data[s] as Record<string, string>) : undefined);
  const noteSquawk = (n: NonNullable<PkgItem['note']>) => out.squawks.push(makeSquawk({ severity: n.severity ?? 'note', file: path, title: n.title, body: n.body, docUrl: doc }));

  // PHP minimum
  if (p.php) {
    const req = sec('require');
    const cur = req?.php;
    const target = `^${p.php.min}`;
    if (cur !== undefined && !satisfiesTarget(cur, target)) {
      if (p.php.unverified || recipe.unverified) {
        out.squawks.push(makeSquawk({ severity: 'review', file: path, title: `Check the PHP minimum (${p.php.min})`, body: `The PHP constraint "${cur}" in ${path} may be too low for ${recipe.to}, but Stepclimb could not verify the exact minimum from an official source. Review it manually.`, docUrl: doc }));
      } else { req!.php = target; changed = true; }
    } else if (cur !== undefined && minVersionOf(cur) === null) {
      out.squawks.push(makeSquawk({ severity: 'review', file: path, title: 'PHP constraint not understood', body: `Could not interpret "${cur}"; make sure it allows PHP ${p.php.min} or higher.`, docUrl: doc }));
    }
  }

  // package bumps
  for (const item of p.packages ?? []) {
    const wanted: (typeof SECTIONS)[number][] = item.section === 'require' ? ['require'] : item.section === 'require-dev' ? ['require-dev'] : [...SECTIONS];
    let present = false;
    let itemChanged = false;
    for (const s of wanted) {
      const block = sec(s);
      const cur = block?.[item.name];
      if (block === undefined || cur === undefined) continue;
      present = true;
      if (item.unverified || recipe.unverified) continue;
      const target = item.constraint!;
      if (satisfiesTarget(cur, target)) continue;
      if (minVersionOf(cur) === null && !/^dev-|\*/.test(cur)) {
        out.squawks.push(makeSquawk({ severity: 'review', file: path, title: `Constraint for ${item.name} not understood`, body: `"${cur}" in ${s} could not be parsed. The target is "${target}".`, docUrl: doc }));
        continue;
      }
      if (/^dev-/.test(cur)) {
        out.squawks.push(makeSquawk({ severity: 'review', file: path, title: `${item.name} is pinned to a dev branch`, body: `"${cur}" in ${s} was left alone. The upgrade targets "${target}".`, docUrl: doc }));
        continue;
      }
      block[item.name] = target;
      itemChanged = changed = true;
    }
    if (present && (item.unverified || recipe.unverified)) {
      out.squawks.push(makeSquawk({
        severity: item.severity ?? 'review', file: path, title: `Verify ${item.name} for ${recipe.to}`,
        body: `${item.name} is installed. Stepclimb has not verified a required version for the ${recipe.from} to ${recipe.to} upgrade from the official guide${item.constraint ? ` (suggested: ${item.constraint})` : ''}. Check the package's own upgrade notes and update it if needed.`, docUrl: doc,
      }));
    }
    if (itemChanged && item.note) noteSquawk(item.note);
  }

  // removals
  for (const r of p.remove ?? []) {
    for (const s of SECTIONS) {
      const block = sec(s);
      if (!block || !(r.name in block)) continue;
      if (r.optional || recipe.unverified) {
        if (r.note) noteSquawk(r.note);
        continue;
      }
      delete block[r.name];
      changed = true;
      if (r.note) noteSquawk(r.note);
    }
  }

  // replacements keep the key position
  for (const r of p.replace ?? []) {
    for (const s of SECTIONS) {
      const block = sec(s);
      if (!block || !(r.from in block) || recipe.unverified) continue;
      data[s] = Object.fromEntries(Object.entries(block).map(([k, v]) => (k === r.from ? [r.to, r.constraint] : [k, v])));
      changed = true;
    }
  }

  if (changed) {
    const next = serialize(data, fmt);
    if (next !== text) { fs.write(path, next); out.changedFiles.push(path); }
  }
  return out;
};
