import { docUrlOf, empty, withPrefix, type Engine } from './engine-types';
import { makeSquawk } from './squawk';

interface Repl { type?: 'exact' | 'regex'; find: string; replace: string; flags?: string; all?: boolean; ifContains?: string; ifNotContains?: string }
interface FileSpec { path: string; replacements: Repl[]; optional?: boolean }

export const applyFilePatch: Engine = (recipe, fs, ctx) => {
  const out = empty();
  const doc = docUrlOf(recipe);
  const files = (recipe.params.files ?? []) as FileSpec[];
  if (recipe.unverified) {
    out.squawks.push(makeSquawk({ severity: 'review', title: `Review manually: ${recipe.title}`, body: `${recipe.summary}\nStepclimb has not verified this change against an official source, so nothing was changed.${files.length ? ` Files: ${files.map((f) => f.path).join(', ')}.` : ''}`, docUrl: doc }));
    return out;
  }
  for (const f of files) {
    const path = withPrefix(ctx, f.path);
    const orig = fs.read(path);
    if (orig === undefined) {
      if (!f.optional) out.squawks.push(makeSquawk({ severity: 'note', file: path, title: `${f.path} not found`, body: `Recipe ${recipe.key} expected this file and skipped it.`, docUrl: doc }));
      continue;
    }
    let text = orig;
    for (const r of f.replacements) {
      if (r.ifContains !== undefined && !text.includes(r.ifContains)) continue;
      if (r.ifNotContains !== undefined && text.includes(r.ifNotContains)) continue;
      if (r.type === 'regex') {
        const flags = r.flags ?? 'g';
        text = text.replace(new RegExp(r.find, flags), r.replace);
      } else if (r.all === false) text = text.replace(r.find, () => r.replace);
      else text = text.split(r.find).join(r.replace);
    }
    if (text !== orig) { fs.write(path, text); out.changedFiles.push(path); }
  }
  return out;
};
