/**
 * Fails when a secret could be in what the browser downloads. Scans `.next/static` (every client bundle) for
 * well-known key shapes and for the values of this process's secret-looking env vars. Run after `npm run build`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const SHAPES: [string, RegExp][] = [
  ["stripe secret key", /\b[sr]k_(live|test)_[A-Za-z0-9]{16,}/],
  ["stripe webhook secret", /\bwhsec_[A-Za-z0-9]{16,}/],
  ["resend key", /\bre_[A-Za-z0-9_]{24,}/],
  ["github token", /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["mongodb uri with password", /mongodb(\+srv)?:\/\/[^\s"'/:]+:[^\s"'@]+@/],
];

const SECRET_NAME = /(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE|MONGODB_URI)/i;

export function secretValues(env: Record<string, string | undefined>): { name: string; value: string }[] {
  return Object.entries(env).filter(([k, v]) => SECRET_NAME.test(k) && !k.startsWith("NEXT_PUBLIC_") && typeof v === "string" && v.length >= 16).map(([name, value]) => ({ name, value: value! }));
}

export function scanText(text: string, env: Record<string, string | undefined> = process.env): string[] {
  const hits: string[] = [];
  for (const [label, re] of SHAPES) if (re.test(text)) hits.push(label);
  for (const s of secretValues(env)) if (text.includes(s.value)) hits.push(`value of ${s.name}`);
  return hits;
}

function* walk(dir: string): Generator<string> {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(js|css|html|json|map|txt)$/.test(f)) yield p;
  }
}

if (process.argv[1]?.endsWith("scan-bundle.ts")) {
  const root = process.argv[2] ?? ".next/static";
  let files = 0;
  const bad: string[] = [];
  for (const f of walk(root)) {
    files++;
    for (const h of scanText(readFileSync(f, "utf8"))) bad.push(`${f}: ${h}`);
  }
  if (bad.length) { console.error(`secret scan FAILED\n${bad.join("\n")}`); process.exit(1); }
  console.log(`secret scan ok: ${files} files under ${root}`);
}
