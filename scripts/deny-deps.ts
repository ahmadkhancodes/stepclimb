import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { bannedDeps, bannedPatternHits, matchesRepoPattern, bannedRepoPatterns } from "../src/lib/security/denylist";
import { FIXTURE_REPOS } from "../src/lib/github/fixtures";

/** CI: fails on banned SDKs in package.json, banned hosts or ad networks in app code, and banned repos among committed fixtures. */
const root = process.cwd();
const problems: string[] = [];

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
for (const d of bannedDeps(pkg)) problems.push(`package.json: banned dependency ${d}`);

// files that name the banned hosts on purpose (the lists themselves, the egress deny list, tests)
const ALLOWED = new Set(["src/lib/security/denylist.ts", "src/lib/runs/types.ts"]);
function walk(dir: string, out: string[] = []) {
  for (const n of readdirSync(dir)) {
    if (n === "node_modules" || n === ".next" || n.startsWith(".")) continue;
    const p = join(dir, n);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|css|mjs|json)$/.test(n)) out.push(p);
  }
  return out;
}
for (const f of walk(join(root, "src"))) {
  const rel = relative(root, f);
  if (ALLOWED.has(rel) || rel.endsWith(".test.ts")) continue;
  for (const id of bannedPatternHits(readFileSync(f, "utf8"))) problems.push(`${rel}: banned pattern ${id}`);
}
for (const r of FIXTURE_REPOS) {
  const hit = matchesRepoPattern(r.fullName, bannedRepoPatterns(""));
  if (hit) problems.push(`fixture repo ${r.fullName} matches banned repo pattern ${hit}`);
}

if (problems.length) {
  console.error(`denylist check failed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log("denylist check passed");
