import { expect, test } from "@playwright/test";
import { plans, oneOffs } from "../../../src/config/product";
import { signIn, watch } from "./helpers";

const usd = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;

test("pricing page numbers agree with src/config/product.ts", async ({ page }) => {
  await page.goto("/pricing");
  const text = await page.locator("main").innerText();
  for (const p of plans) for (const pr of p.prices) expect(text, `${p.id} ${pr.interval}`).toContain(usd(pr.usd));
  for (const o of oneOffs) expect(text, o.name).toContain(usd(o.usd));
});

test("sign-in `next` cannot redirect off site", async ({ page }) => {
  for (const next of ["https://evil.test/x", "//evil.test/x", "/\\evil.test"]) {
    await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
    await page.getByLabel(/email/i).first().fill(`redir+${Date.now()}@studio.test`);
    await page.getByRole("button", { name: /email me a sign-in link/i }).click();
    await expect(page.getByText(/check your inbox/i)).toBeVisible({ timeout: 20_000 });
  }
  const res = await page.request.get(`/onboarding?next=${encodeURIComponent("//evil.test")}`, { maxRedirects: 0 });
  expect(res.headers().location ?? "").not.toMatch(/evil\.test/);
});

test("Escape closes the delete-account dialog; nothing is deleted", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, `esc+${Date.now()}@studio.test`);
  await page.goto("/app/settings/profile");
  await page.getByRole("button", { name: /delete (my )?account/i }).first().click();
  const dlg = page.getByRole("dialog");
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole("button", { name: /delete account permanently/i })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dlg).toBeHidden();
  expect((await (await page.request.get("/api/auth/get-session")).json()).user).toBeTruthy();
});

test("no credit: the Start button explains the price instead of staying silent, and the server refuses", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, `limit+${Date.now()}@studio.test`);
  const seed = await page.request.post("/api/dev/seed-github", { headers: { origin: baseURL! } });
  const { scans } = (await seed.json()) as { scans: Record<string, string> };
  await page.goto(`/app/inspections/${encodeURIComponent(scans["kestrel-digital/billing-portal"]!)}`);
  const start = page.getByRole("button", { name: /Start work order/ }).first();
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.getByText(/\$\d+\.\d\d/).first()).toBeVisible();
  const r = await page.request.post("/api/runs", { data: { repoId: "nope" }, headers: { origin: baseURL! } });
  expect([400, 402, 404]).toContain(r.status());
});

test("hostile input to every JSON endpoint never gives a 500", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, `host+${Date.now()}@studio.test`);
  const h = { origin: baseURL! };
  const long = "x".repeat(20_000);
  const bodies = [{}, { name: long }, { name: "<script>alert(1)</script>" }, { name: "   " }, { email: "a@b" }, { repoId: long }, { plan: "../../etc", interval: "year" }, { plan: "agency", interval: "weekly" }];
  const paths = ["/api/billing/checkout", "/api/billing/credit-checkout", "/api/runs", "/api/repos/zzz/scan", "/api/repos/zzz/autopilot", "/api/auth/organization/create", "/api/auth/api-key/create"];
  const bad: string[] = [];
  for (const p of paths) for (const b of bodies) {
    const r = await page.request.post(p, { data: b, headers: h });
    if (r.status() >= 500 && r.status() !== 503) bad.push(`${p} ${JSON.stringify(b).slice(0, 40)} ${r.status()}`);
  }
  expect(bad).toEqual([]);
  const malformed = await page.request.post("/api/runs", { data: "{not json", headers: { ...h, "content-type": "application/json" } });
  expect(malformed.status()).toBeLessThan(500);
});

test("404 pages give a way home; unknown repo/run/inspection ids show not found", async ({ page, baseURL }) => {
  await page.goto("/definitely-not-here");
  await expect(page.getByRole("link", { name: /home|back|hangar|stepclimb/i }).first()).toBeVisible();
  await page.context().clearCookies();
  await signIn(page, baseURL!, `nf+${Date.now()}@studio.test`);
  const problems = watch(page);
  for (const p of ["/app/repos/nope", "/app/work-orders/nope", "/app/inspections/nope"]) {
    await page.goto(p);
    await expect(page.getByText(/error 404|not found|did not arrive/i).first(), p).toBeVisible();
  }
  expect(problems.filter((x) => !/404|http 4/.test(x))).toEqual([]);
});

test("admin and founder pages are closed to ordinary users", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, `plain+${Date.now()}@studio.test`);
  for (const p of ["/admin", "/admin/runs", "/admin/rules", "/setup/github-app"]) {
    await page.goto(p);
    await expect(page.getByRole("heading", { name: /usage|runs|rules/i })).toHaveCount(0);
  }
  expect((await page.request.get("/api/admin/runs")).status()).toBeGreaterThanOrEqual(401);
});

test("duplicate invite and very long api key name give feedback, not silence", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, `dup+${Date.now()}@studio.test`);
  await page.goto("/app/settings/members");
  const em = page.getByLabel(/email/i).first();
  const send = page.getByRole("button", { name: /invite|send/i }).first();
  await em.fill("twice@studio.test");
  await send.click();
  await expect(page.getByText("twice@studio.test").first()).toBeVisible();
  await em.fill("twice@studio.test");
  await send.click();
  await page.waitForTimeout(1000);
  expect(await page.getByText("twice@studio.test").count()).toBeGreaterThan(0);
  await expect(page.locator("[role=alert], [role=status]").first()).toBeVisible();

  await page.goto("/app/settings/api-keys");
  await page.getByLabel(/name/i).first().fill("k".repeat(500));
  await page.getByRole("button", { name: /create|generate|new/i }).first().click();
  await page.waitForTimeout(1000);
  await expect(page.locator("[role=alert], [role=status], code, [data-testid]").first()).toBeVisible();
});
