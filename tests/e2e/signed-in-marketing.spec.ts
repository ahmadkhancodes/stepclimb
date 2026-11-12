import { expect, test } from "@playwright/test";

const header = (page: import("@playwright/test").Page) => page.getByRole("banner");

test("signed-out marketing pages show Sign in", async ({ page }) => {
  for (const path of ["/", "/pricing", "/docs"]) {
    await page.goto(path);
    await expect(header(page).getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(header(page).getByRole("link", { name: "Open Stepclimb" })).toHaveCount(0);
  }
});

test("signed-in visitors see the app link and billing CTAs", async ({ page, request, baseURL }) => {
  const email = `e2e+mk${Date.now()}@studio.test`;
  const start = await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: { origin: baseURL! } });
  expect(start.ok()).toBeTruthy();
  const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  const link = /https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)?.[0];
  await page.goto(link!);

  for (const path of ["/", "/pricing", "/docs"]) {
    await page.goto(path);
    const open = header(page).getByRole("link", { name: "Open Stepclimb" });
    await expect(open).toBeVisible();
    await expect(open).toHaveAttribute("href", "/app");
    await expect(header(page).getByRole("link", { name: "Sign in" })).toBeHidden();
  }

  await page.goto("/pricing");
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: "Choose Agency" }).first()).toHaveAttribute("href", /\/app\/billing\?plan=agency/);
  await expect(main.getByRole("link", { name: "Inspect a repo free" })).toHaveCount(0);
  await expect(main.getByRole("link", { name: "Open Stepclimb" }).first()).toHaveAttribute("href", "/app");
});
