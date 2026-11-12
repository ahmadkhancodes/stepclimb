import { expect, test } from "@playwright/test";
import { signIn, watch } from "./helpers";

const PUBLIC = ["/", "/pricing", "/security", "/docs", "/guides", "/compare/laravelshift", "/compare/ai-agents", "/laravel-12-to-13", "/laravel-11-to-12", "/guides/laravel-and-php-end-of-life-calendar", "/legal/privacy", "/legal/terms", "/sign-in"];

for (const width of [375, 1440]) {
  test(`public pages clean at ${width}px: no console errors, overflow, dead links, unnamed controls`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const problems = watch(page);
    const links = new Set<string>();
    for (const path of PUBLIC) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `overflow ${path}`).toBeLessThanOrEqual(0);
      const unnamed = await page.evaluate(() =>
        [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea")]
          .filter((el) => {
            const e = el as HTMLElement;
            if (!e.offsetParent && getComputedStyle(e).position !== "fixed") return false;
            const name = (e.getAttribute("aria-label") || e.textContent || (e as HTMLInputElement).placeholder || e.getAttribute("title") || "").trim();
            const labelled = (e as HTMLInputElement).labels?.length || e.getAttribute("aria-labelledby") || !!e.querySelector("img[alt]:not([alt=''])");
            return !name && !labelled;
          })
          .map((e) => e.outerHTML.slice(0, 120)),
      );
      expect(unnamed, `unnamed controls ${path}`).toEqual([]);
      for (const h of await page.$$eval("a[href]", (as) => as.map((a) => (a as HTMLAnchorElement).href))) {
        const u = new URL(h);
        if (u.origin === new URL(page.url()).origin) links.add(u.pathname);
      }
    }
    const dead: string[] = [];
    for (const l of links) {
      const r = await page.request.get(l, { maxRedirects: 5 });
      if (r.status() >= 400) dead.push(`${l} ${r.status()}`);
    }
    expect(dead).toEqual([]);
    expect(problems).toEqual([]);
  });
}

test("signed-in pages clean at 375 and 1440, tap targets and no overflow", async ({ page, baseURL }) => {
  const problems = watch(page);
  await signIn(page, baseURL!, `crawl+${Date.now()}@studio.test`);
  await page.request.post("/api/dev/seed-github", { headers: { origin: baseURL! } });
  const paths = ["/app", "/app/work-orders", "/app/billing", "/app/settings/members", "/app/settings/webhooks", "/app/settings/security", "/app/settings/api-keys", "/app/settings/profile", "/app/settings/audit"];
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const p of paths) {
      const res = await page.goto(p);
      expect(res?.status(), p).toBe(200);
      await page.waitForLoadState("networkidle");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `overflow ${p}@${width}`).toBeLessThanOrEqual(0);
      const unnamed = await page.evaluate(() =>
        [...document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea")]
          .filter((e) => (e as HTMLElement).offsetParent)
          .filter((el) => {
            const name = (el.getAttribute("aria-label") || el.textContent || (el as HTMLInputElement).placeholder || el.getAttribute("title") || "").trim();
            return !name && !(el as HTMLInputElement).labels?.length && !el.getAttribute("aria-labelledby");
          })
          .map((e) => e.outerHTML.slice(0, 120)),
      );
      expect(unnamed, `unnamed ${p}@${width}`).toEqual([]);
    }
  }
  expect(problems).toEqual([]);
});

test("signed out: /app redirects to sign-in, and sign-out returns home", async ({ page, baseURL }) => {
  await page.goto("/app");
  await expect(page).toHaveURL(/\/sign-in/);
  for (const p of ["/app/work-orders", "/app/billing", "/app/settings/members", "/admin"]) {
    await page.goto(p);
    expect(page.url(), p).not.toMatch(/\/app\/(work|billing|settings)/);
  }
  await signIn(page, baseURL!, `out+${Date.now()}@studio.test`);
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Hangar", level: 1 })).toBeVisible();
  const out = page.getByRole("button", { name: /sign out|log out/i }).first();
  if (!(await out.isVisible())) await page.getByRole("button", { name: /account|menu|profile/i }).first().click().catch(() => {});
  await page.getByRole("button", { name: /sign out|log out/i }).first().click();
  await page.waitForLoadState("networkidle");
  await page.goto("/app");
  await expect(page).toHaveURL(/\/sign-in/);
});
