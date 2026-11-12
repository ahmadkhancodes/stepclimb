import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { eolEntries } from "@/components/marketing/dateline";
import { EOL_CALENDAR } from "@/lib/engine/detect/eol";

// Guards for the "work order" identity (docs/design-brief.md). Fails if the generic AI tells come back.
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const ui = walk("src").filter((f) => /\.(tsx|css)$/.test(f));
const css = readFileSync("src/app/globals.css", "utf8");
const fonts = readFileSync("src/app/fonts.ts", "utf8");

describe("EOL dateline", () => {
  it("prints only sourced dates, oldest first", () => {
    const entries = eolEntries();
    expect(entries.length).toBeGreaterThan(0);
    const sourced = new Set([
      ...EOL_CALENDAR.laravel.map((l) => l.securityEnd).filter(Boolean),
      ...EOL_CALENDAR.php.map((p) => p.securityEnd),
    ]);
    for (const e of entries) expect(sourced.has(e.iso)).toBe(true);
    expect(entries.map((e) => e.iso)).toEqual([...entries.map((e) => e.iso)].sort());
  });
  it("includes the next Laravel and PHP security end dates", () => {
    const labels = eolEntries().map((e) => e.label);
    expect(labels).toContain("Laravel 12");
    expect(labels).toContain("PHP 8.2");
  });
});

describe("design system", () => {
  it("uses the work order type pairing, loaded with next/font", () => {
    expect(fonts).toMatch(/Barlow_Condensed/);
    expect(fonts).toMatch(/IBM_Plex_Sans/);
    expect(fonts).toMatch(/IBM_Plex_Mono/);
    expect(fonts).not.toMatch(/style:\s*\[[^\]]*italic/);
  });
  it("no banned fonts anywhere in the UI", () => {
    const hits = ui.filter((f) => /\b(Inter|Geist|Roboto|Arial|Helvetica|Open Sans)\b/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
  it("palette is drafting paper, navy ink and safety orange; orange is a fill with navy text on it", () => {
    expect(css).toMatch(/--n-50:\s*#e8eef3/i);
    expect(css).toMatch(/--n-900:\s*#0d2236/i);
    expect(css).toMatch(/--safety-500:\s*#f26a1b/i);
    expect(css).toMatch(/--action:\s*var\(--safety-500\)/);
    expect(css).toMatch(/--action-text:\s*var\(--n-900\)/);
    expect(css).not.toMatch(/#0b5d6b|#6366f1|#4f46e5|#3b82f6/i);
  });
  it("orange is never used as text colour (2.6:1 on paper)", () => {
    const hits = ui.filter((f) => /(^|[\s"'`:])text-action(?!-text)/.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
  it("old logbook brand tokens and fonts are gone everywhere (UI, emails, OG image, icons)", () => {
    const files = walk("src").filter((f) => /\.(tsx?|css)$/.test(f));
    const old = /#(b23c0e|8e2f0a|f4f1ea|fffdf8|eae5d9|d6cfbf|8f8572|1c1a16|4f4a40|6b6458|f7e3d6)\b|Newsreader|Schibsted|JetBrains|\blogbook\b|stamp-rule|sc-stamp-in/i;
    const hits = files.filter((f) => old.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
  it("surfaces are square: large radii are zero", () => {
    for (const r of ["lg", "xl", "2xl", "3xl"]) expect(css).toMatch(new RegExp(`--radius-${r}:\\s*0px`));
  });
  it("no gradients, glass or glow in the UI", () => {
    const re = /bg-gradient|linear-gradient|radial-gradient|backdrop-blur|blur-3xl/;
    const hits = ui.filter((f) => re.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
  it("no pill badges or vague hype words in the UI", () => {
    const hits = ui.filter((f) => /rounded-full[^"]*px-|\b(seamless|supercharge|streamline|effortless|revolutioni[sz]e)\b/i.test(readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
