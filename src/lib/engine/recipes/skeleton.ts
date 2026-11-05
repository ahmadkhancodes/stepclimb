import { diff3Merge } from 'node-diff3';
import { docUrlOf, empty, withPrefix, type Engine } from './engine-types';
import { makeSquawk } from './squawk';

interface Note { title: string; body: string; severity?: 'review' | 'note' | 'must_fix' }

export const applySkeletonDiff: Engine = (recipe, fs, ctx) => {
  const out = empty();
  const doc = docUrlOf(recipe);
  const files = recipe.params.files as string[];
  const notes = (recipe.params.notes ?? {}) as Record<string, Note>;
  if (recipe.unverified) {
    out.squawks.push(makeSquawk({ severity: 'review', title: `Review the skeleton changes manually: ${recipe.title}`, body: `${recipe.summary}\nStepclimb did not merge these files automatically. Compare against the laravel/laravel skeleton: ${files.join(', ')}.`, docUrl: doc }));
    return out;
  }
  if (!ctx.skeleton) {
    out.squawks.push(makeSquawk({ severity: 'review', title: 'Skeleton files were not supplied', body: 'The run agent did not provide the laravel/laravel skeleton for this hop, so no skeleton merge was done.', docUrl: doc }));
    return out;
  }
  const { from, to } = ctx.skeleton;
  for (const rel of files) {
    const path = withPrefix(ctx, rel);
    const base = from[rel];
    const theirs = to[rel];
    const ours = fs.read(path);
    if (theirs === undefined) {
      if (base !== undefined && ours !== undefined) out.squawks.push(makeSquawk({ severity: 'note', file: path, title: `${rel} was removed from the skeleton`, body: `The upstream skeleton no longer ships ${rel}. It was left in place.`, docUrl: doc }));
      continue;
    }
    if (base === theirs) continue; // upstream unchanged
    if (ours === undefined) {
      if (base === undefined) { fs.write(path, theirs); out.changedFiles.push(path); } // new upstream file
      else out.squawks.push(makeSquawk({ severity: 'note', file: path, title: `${rel} is missing in this repo`, body: `The skeleton changed ${rel} in this hop but the repo has deleted it. It was not re-created.`, docUrl: doc }));
      continue;
    }
    if (ours === theirs) continue;
    const eol = ours.includes('\r\n') ? '\r\n' : '\n';
    const split = (s: string) => s.replace(/\r\n/g, '\n').split('\n');
    const regions = diff3Merge(split(ours), split(base ?? ''), split(theirs), { excludeFalseConflicts: true });
    const conflicts = regions.filter((r) => r.conflict);
    if (conflicts.length) {
      const first = conflicts[0]!.conflict!;
      const hunks = conflicts.map((c, i) => `Hunk ${i + 1} (line ${c.conflict!.aIndex + 1}):\n<<<<<<< repo\n${c.conflict!.a.join('\n')}\n=======\n${c.conflict!.b.join('\n')}\n>>>>>>> laravel skeleton ${recipe.to}`).join('\n\n');
      out.squawks.push(makeSquawk({
        severity: 'must_fix', file: path, line: first.aIndex + 1,
        title: `${rel}: merge conflict with the Laravel ${recipe.to} skeleton`,
        body: `The skeleton changed ${rel} between ${recipe.from} and ${recipe.to}, and so did the repo, in the same place. The repo version was kept. Decide which lines to keep.\n\n${hunks}`,
        docUrl: doc,
      }));
      continue;
    }
    const merged = regions.flatMap((r) => r.ok ?? []).join('\n');
    const next = eol === '\n' ? merged : merged.replace(/\n/g, eol);
    if (next !== ours) {
      fs.write(path, next);
      out.changedFiles.push(path);
      const n = notes[rel];
      if (n) out.squawks.push(makeSquawk({ severity: n.severity ?? 'review', file: path, title: n.title, body: n.body, docUrl: doc }));
    }
  }
  return out;
};
