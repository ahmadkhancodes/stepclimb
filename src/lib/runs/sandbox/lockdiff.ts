import type { DepUpdate } from "../events";

/** Pure helpers that turn two lockfiles into "what moved" (autopilot PR table). Untrusted input: never throws. */
function parse(raw: string | undefined): unknown {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
const clean = (v: unknown) => String(v ?? "").replace(/^v(?=\d)/, "").slice(0, 100);

export function composerLockDiff(before: string | undefined, after: string | undefined): DepUpdate[] {
  const versions = (raw: string | undefined) => {
    const m = new Map<string, string>();
    const doc = parse(raw) as { packages?: { name?: string; version?: string }[]; "packages-dev"?: { name?: string; version?: string }[] } | null;
    for (const p of [...(doc?.packages ?? []), ...(doc?.["packages-dev"] ?? [])]) if (p?.name) m.set(p.name, clean(p.version));
    return m;
  };
  return diff("composer", versions(before), versions(after));
}

export function npmLockDiff(before: string | undefined, after: string | undefined): DepUpdate[] {
  const versions = (raw: string | undefined) => {
    const m = new Map<string, string>();
    const doc = parse(raw) as { packages?: Record<string, { version?: string }> } | null;
    for (const [k, v] of Object.entries(doc?.packages ?? {})) {
      // only the top level of node_modules: nested copies are not what a human reads in a PR table
      const name = k.startsWith("node_modules/") ? k.slice("node_modules/".length) : null;
      if (name && !name.includes("node_modules/") && v?.version) m.set(name, clean(v.version));
    }
    return m;
  };
  return diff("npm", versions(before), versions(after));
}

function diff(ecosystem: DepUpdate["ecosystem"], a: Map<string, string>, b: Map<string, string>): DepUpdate[] {
  const out: DepUpdate[] = [];
  for (const [name, to] of b) {
    const from = a.get(name);
    if (from && from !== to) out.push({ ecosystem, name: name.slice(0, 214), from, to });
  }
  return out.sort((x, y) => x.name.localeCompare(y.name));
}
