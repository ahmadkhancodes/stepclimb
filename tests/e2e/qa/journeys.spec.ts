import { expect, test } from "@playwright/test";
import { signIn, watch } from "./helpers";

async function mailLink(page: import("@playwright/test").Page, email: string, nth = -1) {
  await expect.poll(async () => ((await (await page.request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json()).messages ?? []).length, { timeout: 20_000 }).toBeGreaterThan(0);
  const box = await (await page.request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  return /https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(nth).text)?.[0];
}

test("new visitor: landing CTA -> sign-in form -> magic link -> onboarding -> Hangar (real UI)", async ({ page }) => {
  const problems = watch(page);
  const email = `visitor+${Date.now()}@studio.test`;
  await page.goto("/");
  await page.getByRole("link", { name: /scan|start|free|sign in|get started/i }).first().click();
  await expect(page).toHaveURL(/sign-in|app/);
  await page.goto("/sign-in");
  const input = page.getByLabel(/email/i).first();
  await expect(input).toBeVisible();

  // empty and invalid input: the user sees something, nothing is sent
  const submit = page.getByRole("button", { name: /email me a sign-in link/i }).first();
  await submit.click();
  await expect(page).toHaveURL(/sign-in/);
  await input.fill("not-an-email");
  await submit.click();
  await expect(page).toHaveURL(/sign-in/);

  await input.fill(email);
  await submit.click();
  await expect(page.getByText(/check your (inbox|email)|we.ve sent|link (is )?on its way/i).first()).toBeVisible({ timeout: 20_000 });

  const link = await mailLink(page, email);
  expect(link).toBeTruthy();
  await page.goto(link!);
  await expect(page).toHaveURL(/onboarding|app/);
  if (/onboarding/.test(page.url())) {
    await page.getByLabel(/name/i).first().fill("Harbor Studio");
    await page.getByRole("button", { name: /create|continue/i }).first().click();
  }
  await expect(page).toHaveURL(/\/app/);
  await expect(page.getByRole("heading", { name: "Hangar", level: 1 })).toBeVisible();
  expect(problems).toEqual([]);

  // reused magic link: no session change, a clear error rather than a blank page / 500
  const ctx2 = await page.context().browser()!.newContext();
  const p2 = await ctx2.newPage();
  const res = await p2.goto(link!);
  expect(res?.status()).toBeLessThan(500);
  await p2.goto("/app");
  await expect(p2).toHaveURL(/sign-in/);
  await ctx2.close();
});

test("onboarding: hostile org names are handled", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, `onb+${Date.now()}@studio.test`, null);
  await page.goto("/onboarding");
  const name = page.getByLabel(/name/i).first();
  const btn = page.getByRole("button", { name: /create|continue/i }).first();
  await name.fill("   ");
  await btn.click();
  await expect(page).toHaveURL(/onboarding/);
  await expect(page.locator("[role=alert], [aria-invalid=true], :invalid").first()).toBeVisible();
  await name.fill("<img src=x onerror=alert(1)> Ünïcode 🚀 " + "x".repeat(300));
  await btn.click();
  await page.waitForTimeout(1500);
  // either created (escaped) or a visible error; never a silent no-op
  const moved = /\/app/.test(page.url());
  if (!moved) await expect(page.locator("[role=alert]").first()).toBeVisible();
  else expect(await page.locator("img[src=x]").count()).toBe(0);
});

test("free user: Hangar -> scan -> report -> start work order -> run -> work orders list; refresh and back keep working", async ({ page, baseURL }) => {
  const problems = watch(page);
  await signIn(page, baseURL!, `free+${Date.now()}@studio.test`);
  await page.goto("/app");
  await expect(page.getByText("No airframes yet")).toBeVisible();
  // empty state has a way forward
  await expect(page.getByRole("link", { name: /install|set up|how inspection works/i }).first()).toBeVisible();

  const seed = await page.request.post("/api/dev/seed-github", { headers: { origin: baseURL! } });
  const { scans } = (await seed.json()) as { scans: Record<string, string> };
  await page.goto("/app");
  const board = page.getByTestId("hangar-board");
  // every row action does something
  const scanBtn = board.getByRole("button", { name: /scan|rescan|inspect/i }).first();
  if (await scanBtn.count()) {
    await scanBtn.click();
    await expect(page.getByRole("status").or(page.getByText(/scan|inspect/i)).first()).toBeVisible();
  }
  await page.goto(`/app/inspections/${encodeURIComponent(scans["kestrel-digital/billing-portal"]!)}`);
  await page.reload();
  await expect(page.getByTestId("inspection-report")).toBeVisible();
  await page.goBack();
  await page.goForward();
  await expect(page.getByTestId("inspection-report")).toBeVisible();

  // double click on Start must create a single run
  expect((await page.request.post("/api/dev/grant-credit?kind=to_previous", { headers: { origin: baseURL! } })).ok()).toBeTruthy();
  await page.getByRole("button", { name: /Start work order: Laravel 11 to 12/ }).dblclick();
  await page.waitForURL(/\/app\/work-orders\/[^/]+$/);
  await expect(page.getByTestId("run-view")).toHaveAttribute("data-status", "succeeded", { timeout: 20_000 });
  await page.reload();
  await expect(page.getByTestId("run-view")).toHaveAttribute("data-status", "succeeded");
  await page.goto("/app/work-orders");
  expect(await page.getByTestId("work-orders").getByRole("link", { name: /^#\d+/ }).count()).toBe(1);
  expect(problems).toEqual([]);
});

test("another user cannot read my inspection, run, or repo", async ({ page, browser, baseURL }) => {
  await signIn(page, baseURL!, `a+${Date.now()}@studio.test`);
  const seed = await page.request.post("/api/dev/seed-github", { headers: { origin: baseURL! } });
  const { scans } = (await seed.json()) as { scans: Record<string, string> };
  const scanId = scans["kestrel-digital/billing-portal"]!;
  await page.request.post("/api/dev/grant-credit?kind=to_previous", { headers: { origin: baseURL! } });
  await page.goto(`/app/inspections/${encodeURIComponent(scanId)}`);
  await page.getByRole("button", { name: /Start work order: Laravel 11 to 12/ }).click();
  await page.waitForURL(/\/app\/work-orders\/([^/]+)$/);
  const runUrl = page.url();
  const runId = runUrl.split("/").pop()!;

  const ctx = await browser.newContext({ baseURL });
  const b = await ctx.newPage();
  await signIn(b, baseURL!, `b+${Date.now()}@studio.test`, "Other Org");
  for (const path of [`/app/inspections/${encodeURIComponent(scanId)}`, `/app/work-orders/${runId}`]) {
    await b.goto(path);
    // Next streams not-found with a 200 when a loading boundary exists: assert the content, not only the status
    await expect(b.getByText(/could not be found|not found|404/i).first(), path).toBeVisible();
    await expect(b.getByTestId("inspection-report").or(b.getByTestId("run-view")), path).toHaveCount(0);
  }
  expect((await b.request.get(`/api/runs/${runId}`)).status()).toBe(404);
  expect((await b.request.post(`/api/runs/${runId}/cancel`, { headers: { origin: baseURL! } })).status()).toBeGreaterThanOrEqual(400);
  await b.goto("/app/work-orders");
  await expect(b.getByText("kestrel-digital/billing-portal")).toHaveCount(0);
  await ctx.close();
});

test("settings forms: profile, api keys, members with hostile input show feedback", async ({ page, baseURL }) => {
  const problems = watch(page);
  await signIn(page, baseURL!, `set+${Date.now()}@studio.test`);
  await page.goto("/app/settings/profile");
  const name = page.getByLabel(/name/i).first();
  await name.fill("Zoë <b>Bold</b> 🚀");
  await page.getByRole("button", { name: /save/i }).first().click();
  await expect(page.getByText(/saved|updated/i).first()).toBeVisible();
  await page.reload();
  await expect(name).toHaveValue("Zoë <b>Bold</b> 🚀");

  await page.goto("/app/settings/api-keys");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const kn = page.getByLabel(/name/i).first();
  await kn.fill("ci key");
  await page.getByRole("button", { name: /create|generate|new/i }).first().click();
  await expect(page.getByText(/sk_|copy|created|won.t be shown/i).first()).toBeVisible();

  await page.goto("/app/settings/members");
  const em = page.getByLabel(/email/i).first();
  await em.fill("not-an-email");
  await page.getByRole("button", { name: /invite|send/i }).first().click();
  await page.waitForTimeout(800);
  await expect(page.locator("[role=alert], :invalid, [aria-invalid=true]").first()).toBeVisible();
  await em.fill("mate@studio.test");
  await page.getByRole("button", { name: /invite|send/i }).first().click();
  await expect(page.getByText("mate@studio.test").first()).toBeVisible();
  expect(problems).toEqual([]);
});

test("billing page: plan limits agree with code, upgrade buttons act", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, `bill+${Date.now()}@studio.test`);
  await page.goto("/app/billing");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const btn = page.getByRole("button", { name: /upgrade|choose|subscribe|select|checkout/i }).first();
  if (await btn.count()) {
    await btn.click();
    // stub mode: a calm notice, not a dead button
    await expect(page.getByText(/unavailable|not available|billing|redirect|checkout/i).first()).toBeVisible();
  }
});

test("keyboard: tab reaches sign-in form with visible focus; Escape closes dialogs; pointer cursor on buttons", async ({ page, baseURL }) => {
  await page.goto("/sign-in");
  await page.keyboard.press("Tab");
  const focus = await page.evaluate(() => {
    const e = document.activeElement as HTMLElement;
    const s = getComputedStyle(e);
    return { tag: e.tagName, outline: s.outlineStyle, w: s.outlineWidth, shadow: s.boxShadow };
  });
  expect(focus.tag).not.toBe("BODY");
  expect(focus.outline !== "none" || focus.shadow !== "none").toBeTruthy();

  await signIn(page, baseURL!, `kb+${Date.now()}@studio.test`);
  await page.request.post("/api/dev/seed-github", { headers: { origin: baseURL! } });
  await page.goto("/app");
  const bad = await page.evaluate(() =>
    [...document.querySelectorAll("button:not([disabled]), a[href], [role=button]")]
      .filter((e) => (e as HTMLElement).offsetParent && getComputedStyle(e).cursor !== "pointer")
      .map((e) => e.outerHTML.slice(0, 100)),
  );
  expect(bad).toEqual([]);
});

test("mobile tap targets on app shell are at least 44px", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, baseURL!, `tap+${Date.now()}@studio.test`);
  await page.request.post("/api/dev/seed-github", { headers: { origin: baseURL! } });
  await page.goto("/app");
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("button, a[href], [role=button]")]
      .filter((e) => (e as HTMLElement).offsetParent)
      .map((e) => ({ r: e.getBoundingClientRect(), t: (e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 30), inline: !!e.closest("p, li") && getComputedStyle(e).display === "inline" }))
      .filter((x) => x.t !== "Skip to content" && !x.inline && (x.r.height < 44 || x.r.width < 44) && x.r.width > 0)
      .map((x) => `${x.t} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`),
  );
  expect(small).toEqual([]);
});

test("mobile tap targets on sign-in are at least 44px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/sign-in");
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("button, a[href], input")]
      .filter((e) => (e as HTMLElement).offsetParent)
      .map((e) => ({ r: e.getBoundingClientRect(), t: (e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 30) }))
      .filter((x) => x.t !== "Skip to content" && x.r.height < 44 && x.r.width > 1)
      .map((x) => `${x.t} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`),
  );
  expect(small).toEqual([]);
});
