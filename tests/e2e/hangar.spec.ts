import { createHmac } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

// GitHub is fixture backed (GITHUB_FIXTURES=1): no network. Memory DB.
async function signIn(page: Page, baseURL: string, email: string) {
  const origin = { origin: baseURL };
  const start = await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: origin });
  expect(start.ok()).toBeTruthy();
  const box = await (await page.request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  const link = /https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)?.[0];
  await page.goto(link!);
  const org = await page.request.post("/api/auth/organization/create", { data: { name: "Kestrel Digital", slug: `kestrel-${Date.now()}-${Math.floor(Math.random() * 1e4)}` }, headers: origin });
  expect(org.ok()).toBeTruthy();
  await page.request.post("/api/auth/organization/set-active", { data: { organizationId: (await org.json()).id }, headers: origin });
}

test("Hangar empty state, then fixture board and free scan report", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, `owner+${Date.now()}@studio.test`);
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Hangar", level: 1 })).toBeVisible();
  await expect(page.getByText("No airframes yet")).toBeVisible();

  const seed = await page.request.post("/api/dev/seed-github", { headers: { origin: baseURL! } });
  expect(seed.ok()).toBeTruthy();
  await page.goto("/app");
  const board = page.getByTestId("hangar-board");
  await expect(board).toBeVisible();
  await expect(board.getByRole("note", { name: "Service bulletin" })).toContainText("Laravel 12 security support ends 24 Feb 2027");
  await expect(board.getByRole("columnheader", { name: "Behind" })).toBeVisible();
  await expect(board.getByRole("columnheader", { name: "Support" })).toBeVisible();
  await expect(board.getByRole("columnheader", { name: "Tests" })).toBeVisible();
  await expect(board.getByRole("columnheader", { name: "Last work order" })).toBeVisible();
  await expect(board.getByText("kestrel-digital/dispatch-api").first()).toBeVisible();

  await board.getByRole("link", { name: "Open inspection" }).first().click();
  const report = page.getByTestId("inspection-report");
  await expect(report).toBeVisible();
  await expect(page.getByText(/composer\.json, composer\.lock and package\.json only/)).toBeVisible();
  await expect(report.getByRole("heading", { name: "EOL calendar" })).toBeVisible();
  await expect(report.getByText("Applicable recipes").first()).toBeVisible();
  await expect(report.getByLabel(/^Effort [SMLX]+$/).first()).toBeVisible();
});

test("Hangar has no horizontal overflow at 375px", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page, baseURL!, `mobile+${Date.now()}@studio.test`);
  await page.request.post("/api/dev/seed-github", { headers: { origin: baseURL! } });
  await page.goto("/app");
  await expect(page.getByTestId("hangar-board")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test("GitHub webhook checks the signature", async ({ request }) => {
  const body = JSON.stringify({ action: "created", installation: { id: 777, account: { login: "acme", type: "User" } } });
  const sig = (s: string) => `sha256=${createHmac("sha256", s).update(body).digest("hex")}`;
  const h = (signature: string, delivery: string) => ({ "x-hub-signature-256": signature, "x-github-event": "installation", "x-github-delivery": delivery, "content-type": "application/json" });
  expect((await request.post("/api/github/webhook", { data: body, headers: h(sig("wrong"), "e2e-1") })).status()).toBe(401);
  expect((await request.post("/api/github/webhook", { data: body })).status()).toBe(401);
  expect((await request.post("/api/github/webhook", { data: body, headers: h(sig("e2e-hook"), "e2e-2") })).status()).toBe(200);
  const again = await request.post("/api/github/webhook", { data: body, headers: h(sig("e2e-hook"), "e2e-2") });
  expect((await again.json()).duplicate).toBe(true);
});

test("GitHub App setup page is founder only and posts the manifest to github.com", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, `member+${Date.now()}@studio.test`);
  expect((await page.goto("/setup/github-app"))!.status()).toBe(404);
  await page.context().clearCookies();
  await signIn(page, baseURL!, "founder@studio.test");
  await page.goto("/setup/github-app");
  await expect(page.getByRole("heading", { name: "GitHub App setup" })).toBeVisible();
  const form = page.locator("form[action^='https://github.com/settings/apps/new']");
  await expect(form).toHaveAttribute("method", "post");
  const manifest = JSON.parse(await form.locator("input[name=manifest]").inputValue());
  expect(manifest.hook_attributes.url).toMatch(/\/api\/github\/webhook$/);
  expect(manifest.default_permissions.contents).toBe("write");
  // callback without a valid state never reaches GitHub
  const cb = await page.request.get("/api/github/manifest/callback?code=abcdefgh1234&state=bad", { maxRedirects: 0 });
  expect(cb.status()).toBe(303);
  expect(cb.headers().location).toContain("error=state");
});
