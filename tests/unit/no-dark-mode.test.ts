import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The product is light only. Fails if dark mode or a theme toggle comes back in src/.
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk("src").filter((f) => /\.(tsx?|css|mdx?)$/.test(f));
const banned: [string, RegExp][] = [
  ["dark: utility", /(^|[\s"'`{(])dark:/],
  ["prefers-color-scheme: dark", /prefers-color-scheme:\s*dark/],
  ["data-theme", /data-theme/],
  ["color-scheme: dark", /color-scheme:\s*dark/],
  ["theme toggle", /ThemeToggle|themeInitScript|theme-script/],
  ["theme localStorage key", /localStorage\.(get|set)Item\(\s*["']theme["']/],
  ["custom dark variant", /@custom-variant\s+dark/],
];

describe("light only", () => {
  for (const [name, re] of banned) {
    it(`src has no ${name}`, () => {
      const hits = files.filter((f) => re.test(readFileSync(f, "utf8")));
      expect(hits).toEqual([]);
    });
  }
  it("globals.css declares color-scheme: light", () => {
    expect(readFileSync("src/app/globals.css", "utf8")).toMatch(/color-scheme:\s*light/);
  });
});
