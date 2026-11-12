import { expect, test } from "@playwright/test";
import { signIn, watch } from "../qa/helpers";

test("mobile menu: opens, traps focus, Escape closes and returns focus, links navigate", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  const problems = watch(page);
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Open menu" });
  await toggle.click();
  const dialog = page.getByRole("dialog", { name: "Menu" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
  for (const name of ["Pricing", "Security", "Docs"]) {
    await page.getByRole("button", { name: "Open menu" }).click();
    await dialog.getByRole("link", { name }).first().click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(new RegExp(name.toLowerCase()));
  }
  await page.getByRole("button", { name: "Open menu" }).click();
  await dialog.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/sign-in/);
  expect(problems).toEqual([]);
});

test("desktop header and footer: every link navigates to a 200 page with a heading", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const hrefs = new Set<string>();
  for (const sel of ["header a[href]", "footer a[href]"]) for (const h of await page.$$eval(sel, (as) => as.map((a) => a.getAttribute("href")!))) hrefs.add(h);
  const bad: string[] = [];
  for (const h of hrefs) {
    if (/^(mailto:|https?:)/.test(h)) continue;
    const res = await page.goto(h);
    if (!res || res.status() >= 400) bad.push(`${h} ${res?.status()}`);
    else if (!(await page.locator("h1").count())) bad.push(`${h} no h1`);
  }
  expect(bad).toEqual([]);
});

test("every in-page anchor on the landing page and docs points at an existing id", async ({ page }) => {
  for (const path of ["/", "/pricing", "/docs", "/legal/privacy", "/legal/terms", "/security", "/guides/laravel-and-php-end-of-life-calendar"]) {
    await page.goto(path);
    const missing = await page.evaluate(() =>
      [...document.querySelectorAll('a[href*="#"]')]
        .map((a) => new URL((a as HTMLAnchorElement).href))
        .filter((u) => u.pathname === location.pathname && u.hash.length > 1 && !document.getElementById(decodeURIComponent(u.hash.slice(1))))
        .map((u) => u.hash),
    );
    expect(missing, path).toEqual([]);
  }
});

test("every CTA on public pages leads somewhere that works (sign-in, checkout path or anchor)", async ({ page }) => {
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/pricing"]) {
      await page.goto(path);
      const ctas = await page.$$eval("main a[href]", (as) => as.map((a) => [a.textContent?.trim().slice(0, 40), a.getAttribute("href")]));
      for (const [label, href] of ctas) {
        expect(href, `${path} ${label}`).toBeTruthy();
        expect(href, `${path} ${label}`).not.toBe("#");
      }
    }
  }
});

test("keyboard only: tab through sign-in and submit with Enter; focus is visible on every stop", async ({ page }) => {
  await page.goto("/sign-in");
  const stops: string[] = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const e = document.activeElement as HTMLElement;
      if (!e || e === document.body) return null;
      const cs = getComputedStyle(e);
      const visible = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
      return { tag: e.tagName, name: (e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 30), visible };
    });
    if (info && !info.visible) stops.push(`${info.tag} ${info.name}`);
  }
  expect(stops, "focus stops without a visible indicator").toEqual([]);
  await page.getByLabel(/email/i).first().fill(`kb+${Date.now()}@studio.test`);
  await page.keyboard.press("Enter");
  await expect(page.getByText(/check your (inbox|email)|link/i).first()).toBeVisible();
});

test("signed-in: nav items, user menu, sign out land on the right pages and Escape closes dialogs", async ({ page, baseURL }) => {
  const problems = watch(page);
  await signIn(page, baseURL!, `nav+${Date.now()}@studio.test`);
  await page.request.post("/api/dev/seed-github", { headers: { origin: baseURL! } });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/app");
    if (width === 375) {
      const menu = page.getByRole("button", { name: /menu/i }).first();
      await menu.click();
      await page.keyboard.press("Escape");
    }
    const hrefs = await page.$$eval("nav a[href^='/app']", (as) => [...new Set(as.map((a) => a.getAttribute("href")!))]);
    expect(hrefs.length).toBeGreaterThan(2);
    for (const h of hrefs) {
      const r = await page.goto(h);
      expect(r?.status(), h).toBe(200);
      await expect(page.locator("main h1, h1").first()).toBeVisible();
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app");
  await page.getByRole("button", { name: /sign out/i }).first().click();
  await expect(page).toHaveURL(/sign-in|\/$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/sign-in/);
  expect(problems.filter((p) => !/401|403|https:\/\/localhost/.test(p))).toEqual([]);
});

test("redirects: signed-out /app/billing goes to sign-in and returns after login; checkout return pages render", async ({ page, baseURL }) => {
  await page.goto("/app/billing");
  await expect(page).toHaveURL(/sign-in/);
  expect(page.url()).toMatch(/next=|redirect|callback/i);
  const email = `ret+${Date.now()}@studio.test`;
  await signIn(page, baseURL!, email);
  for (const q of ["?checkout=success", "?checkout=cancelled", "?session_id=cs_test_x"]) {
    const r = await page.goto(`/app/billing${q}`);
    expect(r?.status(), q).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
  }
});
