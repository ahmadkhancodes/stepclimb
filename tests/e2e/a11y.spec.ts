import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// Accessibility gate (M5): axe-core on the public pages in light, plus 44 px touch targets and keyboard focus at 375.
// axe-core is already in the lockfile (eslint-plugin-jsx-a11y depends on it); it is injected as a script, no new dependency (D-36).
const axePath = join(process.cwd(), "node_modules", "axe-core", "axe.min.js");
const PAGES = ["/", "/pricing", "/security", "/compare/laravelshift", "/guides", "/laravel-12-to-13", "/sign-in"];

type Violation = { id: string; impact: string | null; help: string; nodes: { target: string[] }[] };
async function axe(page: Page): Promise<Violation[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const r = await (window as unknown as { axe: { run: (c: unknown, o: unknown) => Promise<{ violations: Violation[] }> } }).axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      resultTypes: ["violations"],
    });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 5).map((n) => ({ target: n.target })) }));
  });
}

for (const path of PAGES) {
  test(`axe: ${path} has no serious or critical WCAG A/AA violations`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const bad = (await axe(page)).filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
  });
}

test.describe("375 px", () => {
  test.use({ viewport: { width: 375, height: 812 } });
  for (const path of ["/", "/pricing", "/sign-in"]) {
    test(`${path}: interactive targets are at least 44 px tall or inline in text`, async ({ page }) => {
      await page.goto(path);
      const small = await page.evaluate(() => {
        const out: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("a[href], button, input:not([type=hidden]), select, summary"))) {
          const r = el.getBoundingClientRect();
          if (r.width <= 1 || r.height <= 1) continue; // hidden or screen reader only (skip link until focused)
          const style = getComputedStyle(el);
          if (style.visibility === "hidden") continue;
          // links inside running text are exempt (WCAG 2.5.8 inline exception)
          const inline = el.tagName === "A" && style.display === "inline" && !!el.closest("p, li, td, dd");
          if (!inline && r.height < 44 && r.width < 44) out.push(`${el.tagName.toLowerCase()} "${(el.textContent ?? el.getAttribute("aria-label") ?? "").trim().slice(0, 40)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
        }
        return out;
      });
      expect(small).toEqual([]);
    });
  }
  test("keyboard: skip link first, focus is visible", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const first = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      const s = a ? getComputedStyle(a) : null;
      return { text: a?.textContent?.trim() ?? "", href: a?.getAttribute("href") ?? "", outline: s ? `${s.outlineStyle} ${s.outlineWidth}` : "", shadow: s?.boxShadow ?? "none" };
    });
    expect(first.href).toBe("#main");
    expect(first.outline !== "none 0px" || first.shadow !== "none").toBe(true);
  });
});
