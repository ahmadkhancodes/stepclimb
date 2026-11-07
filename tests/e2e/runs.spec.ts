import { expect, test, type Page } from "@playwright/test";

// Fixture backed: GITHUB_FIXTURES=1 gives a fake runner (real agent, in process), a recording GitHub host and memory DB. No network.
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

test("work order page: empty list, pay per run prompt, then a verified run with steps, log and squawks", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, `runs+${Date.now()}@studio.test`);
  await page.goto("/app/work-orders");
  await expect(page.getByRole("heading", { name: "Work orders", level: 1 })).toBeVisible();
  await expect(page.getByText("No work orders yet")).toBeVisible();

  const seed = await page.request.post("/api/dev/seed-github", { headers: { origin: baseURL! } });
  const { scans } = (await seed.json()) as { scans: Record<string, string> };
  await page.goto(`/app/inspections/${encodeURIComponent(scans["kestrel-digital/billing-portal"]!)}`);

  // no credit yet: the start button turns into the one time price, from the existing one off price list
  await page.getByRole("button", { name: /Start work order: Laravel 11 to 12/ }).click();
  await expect(page.getByText(/One verified PR for \$14\.99/)).toBeVisible();
  await page.getByRole("button", { name: "Not now" }).click();

  // after the one time purchase (simulated: the webhook grants a credit) the run starts
  expect((await page.request.post("/api/dev/grant-credit?kind=to_previous", { headers: { origin: baseURL! } })).ok()).toBeTruthy();
  await page.getByRole("button", { name: /Start work order: Laravel 11 to 12/ }).click();
  await page.waitForURL(/\/app\/work-orders\/[^/]+$/);
  const view = page.getByTestId("run-view");
  await expect(view).toBeVisible();
  await expect(view).toHaveAttribute("data-status", "succeeded", { timeout: 20_000 });
  await expect(view.getByText("Verified").first()).toBeVisible();
  await expect(view.getByRole("link", { name: /Open PR #1/ })).toBeVisible();
  await expect(view.getByRole("region", { name: "Steps" })).toContainText("verify:tests");
  await expect(view.getByRole("log", { name: "Log output" })).toContainText("laravel/framework upgraded to 12.x");
  await expect(view.getByRole("heading", { name: /^Squawks/ })).toBeVisible();

  await page.goto("/app/work-orders");
  await expect(page.getByTestId("work-orders")).toContainText("kestrel-digital/billing-portal");
});

test("runner events endpoint refuses unsigned events", async ({ request, baseURL }) => {
  const res = await request.post("/api/runner/events", { data: { runId: "nope", seq: 1, event: { type: "log_chunk", stream: "stdout", text: "x" } }, headers: { origin: baseURL! } });
  expect([401, 404]).toContain(res.status());
});
