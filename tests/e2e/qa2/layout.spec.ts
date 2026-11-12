import { expect, test } from "@playwright/test";
import { signIn } from "../qa/helpers";

const PUBLIC = ["/", "/pricing", "/security", "/docs", "/guides", "/compare/laravelshift", "/compare/ai-agents", "/laravel-12-to-13", "/laravel-11-to-12", "/guides/laravel-and-php-end-of-life-calendar", "/legal/privacy", "/legal/terms", "/sign-in"];
const APP = ["/app", "/app/work-orders", "/app/billing", "/app/settings/members", "/app/settings/webhooks", "/app/settings/security", "/app/settings/api-keys", "/app/settings/profile", "/app/settings/audit"];

/** Runs in the page: clipped text and WCAG AA contrast of visible text. */
async function inspect(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const parse = (s: string) => { const m = /rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?/.exec(s); return m ? { r: +m[1]!, g: +m[2]!, b: +m[3]!, a: m[4] === undefined ? 1 : +m[4] } : null; };
    const lum = (c: { r: number; g: number; b: number }) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const bgOf = (el: Element) => {
      let acc = { r: 255, g: 255, b: 255 };
      const layers: { r: number; g: number; b: number; a: number }[] = [];
      for (let e: Element | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.backgroundImage !== "none") return null; // gradients/images: skip
        const c = parse(cs.backgroundColor);
        if (c && c.a > 0) { layers.push(c); if (c.a === 1) break; }
      }
      for (const l of layers.reverse()) acc = { r: l.r * l.a + acc.r * (1 - l.a), g: l.g * l.a + acc.g * (1 - l.a), b: l.b * l.a + acc.b * (1 - l.a) };
      return acc;
    };
    const low: string[] = [];
    const clipped: string[] = [];
    for (const el of document.querySelectorAll("body *")) {
      const e = el as HTMLElement;
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity === 0 || e.closest("[inert],[aria-hidden=true]")) continue;
      const r = e.getBoundingClientRect();
      if (r.width <= 2 || r.height <= 2) continue; // sr-only text is clipped on purpose
      const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim());
      if (!own) continue;
      if ((cs.overflowX === "hidden" || cs.textOverflow === "ellipsis") && e.scrollWidth > e.clientWidth + 1 && !e.closest("table")) clipped.push(`${e.tagName} "${e.textContent?.trim().slice(0, 40)}"`);
      const fg = parse(cs.color);
      const bg = bgOf(e);
      if (!fg || !bg) continue;
      const a = fg.a;
      const mix = { r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a) };
      const L1 = lum(mix), L2 = lum(bg);
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
      const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      if (ratio < need) low.push(`${e.tagName} "${e.textContent?.trim().slice(0, 30)}" ${ratio.toFixed(2)}<${need}`);
    }
    return { low: [...new Set(low)], clipped: [...new Set(clipped)] };
  });
}

for (const width of [375, 1440]) {
  test(`public pages at ${width}px: no clipped text, AA contrast`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const out: string[] = [];
    for (const p of PUBLIC) {
      await page.goto(p);
      await page.waitForLoadState("networkidle");
      const r = await inspect(page);
      out.push(...r.low.map((x) => `${p} low ${x}`), ...r.clipped.map((x) => `${p} clipped ${x}`));
    }
    expect(out).toEqual([]);
  });

  test(`signed-in pages at ${width}px: no clipped text, AA contrast`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, baseURL!, `lay${width}+${Date.now()}@studio.test`);
    await page.request.post("/api/dev/seed-github", { headers: { origin: baseURL! } });
    const out: string[] = [];
    for (const p of APP) {
      await page.goto(p);
      await page.waitForLoadState("networkidle");
      const r = await inspect(page);
      out.push(...r.low.map((x) => `${p} low ${x}`), ...r.clipped.map((x) => `${p} clipped ${x}`));
    }
    expect(out).toEqual([]);
  });
}
