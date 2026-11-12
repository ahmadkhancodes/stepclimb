import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { staggerDelay } from "@/components/marketing/site-header";
import { proofFacts } from "@/content/proof";

// Landing page compliance with .claude/skills/landing-page-design (B1, B2, B5, B7, B11) and docs/factory/DESIGN_PLAYBOOK.md.
const css = readFileSync("src/app/globals.css", "utf8");
const page = readFileSync("src/app/(marketing)/page.tsx", "utf8");
const tagline = readFileSync("src/components/marketing/tagline-reveal.tsx", "utf8");
const header = readFileSync("src/components/marketing/site-header.tsx", "utf8");

const SCALE: Record<string, string> = {
  "0.75rem": "1rem", "0.875rem": "1.25rem", "1rem": "1.5rem", "1.125rem": "1.75rem", "1.25rem": "1.75rem",
  "1.5rem": "2rem", "1.875rem": "2.25rem", "2.25rem": "2.5rem", "3rem": "1", "3.75rem": "1", "4.5rem": "1", "6rem": "1", "8rem": "1",
};

/** Visible strings of the landing page: JSX text plus quoted strings, minus class names, imports and identifiers. */
function visibleCopy(src: string): string[] {
  const text = [...src.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]);
  const strings = [...src.matchAll(/"([^"\n]{12,})"/g)].map((m) => m[1]).filter((s) => / /.test(s) && !/^[a-z0-9:[\]/.()_ -]+$/.test(s));
  return [...text, ...strings].map((s) => s.trim()).filter(Boolean);
}

describe("type scale (B1)", () => {
  it("every font size in the global CSS is a Tailwind step with its paired line height", () => {
    const decls = [...css.matchAll(/font-size:\s*([\d.]+rem);\s*line-height:\s*([\d.]+(?:rem)?)/g)];
    expect(decls.length).toBeGreaterThan(20);
    for (const [, size, lh] of decls) {
      expect(SCALE[size], `font-size ${size}`).toBeDefined();
      expect(lh, `line-height for ${size}`).toBe(SCALE[size]);
    }
    expect(css).not.toMatch(/font-size:\s*[\d.]+px/);
  });
  it("no weight above 700 and no italics", () => {
    for (const [, w] of css.matchAll(/font-weight:\s*(\d+)/g)) expect(Number(w)).toBeLessThanOrEqual(700);
    expect(css).not.toMatch(/font-style:\s*italic/);
  });
});

describe("copy (B1)", () => {
  it("no hyphenated words in visible landing copy", () => {
    const allowed = /^(composer\.\w+|package\.json|laravelshift\.com)$/;
    const hits = visibleCopy(page).flatMap((s) => s.match(/\b[A-Za-z]+-[A-Za-z]+\b/g) ?? []).filter((w) => !allowed.test(w));
    expect(hits).toEqual([]);
  });
});

describe("hero (B5)", () => {
  it("heading and subheading are capped at 680px and the line break keeps a space in textContent", () => {
    expect(css).toMatch(/--container-hero:\s*680px/);
    const hero = page.slice(page.indexOf('id="hero-title"'), page.indexOf("</ul>"));
    expect(hero.match(/max-w-hero/g)?.length).toBe(2);
    expect(hero).toMatch(/\{" "\}<br/);
  });
  it("one primary action above the fold", () => {
    const hero = page.slice(page.indexOf("<h1"), page.indexOf("</section>"));
    expect(hero.match(/SessionButtonLink/g)?.length).toBe(1);
    expect(hero).not.toMatch(/<a href="#/);
  });
});

describe("motion (B7, B11)", () => {
  it("tagline words start at 30% ink, animate opacity on the base curve, and are full ink under reduced motion", () => {
    expect(css).toMatch(/\.kit-word \{ opacity: 0\.3; transition: opacity 500ms var\(--ease-out-kit\); \}/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)[^@]*\.kit-word \{ opacity: 1; transition: none; \}/);
    expect(tagline).toMatch(/new IntersectionObserver/);
    expect(tagline).toMatch(/prefers-reduced-motion: reduce/);
    expect(tagline).not.toMatch(/addEventListener\("scroll"/);
  });
  it("tagline is not directly under the hero", () => {
    const sections = [...page.matchAll(/<(section|Section|TaglineReveal)\b/g)].map((m) => m[1]);
    expect(sections.indexOf("TaglineReveal")).toBeGreaterThan(1);
  });
  it("no browser default curves or sub 200ms durations in the CSS", () => {
    expect(css).not.toMatch(/\b(ease-out|ease-in|ease-in-out|linear)\b\s*[\d;]/);
    for (const [, ms] of css.matchAll(/(\d+)ms/g)) if (ms !== "0") expect(Number(ms) >= 200 || ms === "01").toBe(true);
  });
  it("mobile menu links step 60ms apart and the sequence never exceeds 400ms", () => {
    expect(staggerDelay(1, 5)).toBe(60);
    expect(staggerDelay(4, 5)).toBe(240);
    expect(staggerDelay(9, 10)).toBeLessThanOrEqual(400);
    expect(header).toMatch(/backdrop-blur/);
    expect(header).toMatch(/translate-y-6/);
  });
});

describe("honest proof (A2, B8)", () => {
  it("counts come from the shipped rule files", () => {
    const f = proofFacts();
    expect(f.recipes).toBeGreaterThan(0);
    expect(f.upgradePaths).toBe(3);
    expect(f.repairRules).toBeGreaterThan(0);
  });
});
