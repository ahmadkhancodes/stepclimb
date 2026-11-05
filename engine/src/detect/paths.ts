/** Directories containing a composer.json. Root is '', sorted with root first. */
export function findAppPaths(treePaths: string[]): string[] {
  const out = new Set<string>();
  for (const raw of treePaths) {
    const p = raw.replace(/^\.?\//, '');
    if (p !== 'composer.json' && !p.endsWith('/composer.json')) continue;
    const segs = p.split('/').slice(0, -1);
    if (segs.some((s) => s === 'vendor' || s === 'node_modules' || s === 'tests')) continue;
    out.add(segs.join('/'));
  }
  return [...out].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a < b ? -1 : a > b ? 1 : 0));
}
