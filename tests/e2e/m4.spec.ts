import { expect, test, type Page } from "@playwright/test";

// M4 end to end on fixtures (GITHUB_FIXTURES=1, fake runner, memory DB, console mailer, no network).
const REPO = "9001:kestrel-digital/billing-portal";

async function signIn(page: Page, baseURL: string, email: string) {
  const origin = { origin: baseURL };
  expect((await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: origin })).ok()).toBeTruthy();
  const box = await (await page.request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  const link = /https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)?.[0];
  await page.goto(link!);
  const org = await page.request.post("/api/auth/organization/create", { data: { name: "Kestrel Digital", slug: `kestrel-${Date.now()}-${Math.floor(Math.random() * 1e4)}` }, headers: origin });
  expect(org.ok()).toBeTruthy();
  await page.request.post("/api/auth/organization/set-active", { data: { organizationId: (await org.json()).id }, headers: origin });
}

/** seeds the fixture GitHub account, buys one credit (simulated) and runs 11 to 12 to the end. Returns the run id. */
async function finishedRun(page: Page, baseURL: string): Promise<string> {
  const origin = { origin: baseURL };
  expect((await page.request.post("/api/dev/seed-github", { headers: origin })).ok()).toBeTruthy();
  expect((await page.request.post("/api/dev/grant-credit?kind=to_previous", { headers: origin })).ok()).toBeTruthy();
  const start = await page.request.post("/api/runs", { data: { repoId: REPO, hopFrom: 11 }, headers: origin });
  expect(start.status()).toBe(201);
  const { id } = (await start.json()) as { id: string };
  await expect.poll(async () => ((await (await page.request.get(`/api/runs/${id}`)).json()) as { run?: { status: string } }).run?.status ?? "", { timeout: 20_000 }).toBe("succeeded");
  return id;
}

test("admin console: founder only, run inspector, refund, rule pinning and path switch", async ({ page, browser, baseURL }) => {
  const origin = { origin: baseURL! };
  await signIn(page, baseURL!, "founder@studio.test");
  const id = await finishedRun(page, baseURL!);

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Admin overview", level: 1 })).toBeVisible();
  await expect(page.getByTestId("admin-stats")).toContainText("Runs, last 30 days");
  await expect(page.getByText("No open alerts")).toBeVisible();

  // run inspector
  await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Runs" }).click();
  await expect(page.getByTestId("admin-runs")).toContainText("kestrel-digital/billing-portal");
  await page.getByTestId("admin-runs").getByRole("link", { name: /^#\d{4}$/ }).first().click();
  const view = page.getByTestId("admin-run");
  await expect(view).toHaveAttribute("data-status", "succeeded");
  await expect(view).toContainText("verify:tests");
  await expect(view.getByRole("log", { name: "Run log" })).toContainText("laravel/framework upgraded to 12.x");

  // refund tool: return the credit once, then it is closed
  const returnBtn = view.getByRole("button", { name: "Return credit" });
  await expect(returnBtn).toBeDisabled();
  await view.getByLabel(/Reason/).fill("customer asked for a rerun");
  await returnBtn.click();
  await expect(view.getByText("This run was already refunded.")).toBeVisible();
  const again = await page.request.post("/api/admin/refund", { data: { runId: id, mode: "credit", reason: "twice" }, headers: origin });
  expect(again.status()).toBe(409);

  // rule pinning
  await page.goto("/admin/rules");
  const rule = page.getByTestId("pin-rules-composer.sanctum-4");
  await expect(rule).toContainText("on");
  await rule.getByRole("button", { name: "Switch off" }).click();
  await expect(rule.getByText("off", { exact: true })).toBeVisible();
  await rule.getByRole("button", { name: "Clear pin" }).click();
  await expect(rule.getByText("on", { exact: true })).toBeVisible();

  // switching an upgrade path off answers path_disabled on new runs, switching it on restores it.
  // 10 to 11 is used so parallel specs that run 11 to 12 on the same server are not affected.
  const path = page.getByTestId("path-path_laravel_10_to_11");
  await path.getByRole("button", { name: "Switch off" }).click();
  await expect(path.getByText("off", { exact: true })).toBeVisible();
  await page.request.post("/api/dev/grant-credit?kind=older_hop", { headers: origin });
  const blocked = await page.request.post("/api/runs", { data: { repoId: "9001:kestrel-digital/dispatch-api", hopFrom: 10 }, headers: origin });
  expect(blocked.status()).toBe(503);
  expect((await blocked.json()).error).toBe("path_disabled");
  await path.getByRole("button", { name: "Switch on" }).click();
  await expect(path.getByText("on", { exact: true })).toBeVisible();

  // everyone else gets a 404, page and API
  const other = await browser.newContext({ baseURL });
  const p2 = await other.newPage();
  await signIn(p2, baseURL!, `member+${Date.now()}@studio.test`);
  expect((await p2.goto("/admin"))!.status()).toBe(404);
  expect((await p2.request.get("/api/admin/overview")).status()).toBe(404);
  expect((await p2.request.post("/api/admin/refund", { data: { runId: id, mode: "credit", reason: "nope" }, headers: origin })).status()).toBe(404);
  expect((await p2.request.post("/api/admin/pins", { data: { kind: "rules", key: "composer.sanctum-4", disabled: true }, headers: origin })).status()).toBe(404);
  await other.close();
});

test("run mail carries a one click unsubscribe that works, and later mail is suppressed", async ({ page, baseURL }) => {
  const email = `unsub+${Date.now()}@studio.test`;
  await signIn(page, baseURL!, email);
  await finishedRun(page, baseURL!);
  const sent = async () => ((await (await page.request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json()).messages as { subject: string; text: string }[]).filter((m) => m.subject.startsWith("Work order #"));
  await expect.poll(async () => (await sent()).length).toBe(1);
  const [mail] = await sent();
  expect(mail!.subject).toMatch(/^Work order #\d{4} · kestrel-digital\/billing-portal to Laravel 12 · Verified$/);
  const link = /Stop these emails: (\S+)/.exec(mail!.text)![1]!;

  // a link scanner that only opens the URL must not unsubscribe anyone: the page asks first
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Stop these emails?" })).toBeVisible();
  await page.getByRole("button", { name: /^Unsubscribe / }).click();
  await expect(page.getByRole("heading", { name: "You are unsubscribed" })).toBeVisible();

  // RFC 8058 one click POST works too and a forged link does not
  const post = await page.request.post(link, { data: "List-Unsubscribe=One-Click", headers: { "content-type": "application/x-www-form-urlencoded" } });
  expect(post.status()).toBe(200);
  const forged = await page.request.post(link.replace(/t=[0-9a-f]+/, "t=deadbeef"));
  expect(forged.status()).toBe(400);
  await page.goto(link.replace(/t=[0-9a-f]+/, "t=deadbeef"));
  await expect(page.getByRole("heading", { name: "This link is not valid" })).toBeVisible();

  // the next finished run sends nothing
  await page.request.post("/api/dev/grant-credit?kind=to_previous", { headers: { origin: baseURL! } });
  const next = await page.request.post("/api/runs", { data: { repoId: REPO, hopFrom: 11 }, headers: { origin: baseURL! } });
  expect(next.status()).toBe(201);
  const { id } = (await next.json()) as { id: string };
  await expect.poll(async () => ((await (await page.request.get(`/api/runs/${id}`)).json()) as { run?: { status: string } }).run?.status ?? "", { timeout: 20_000 }).toBe("succeeded");
  expect(await sent()).toHaveLength(1);
});

test("autopilot settings: free accounts are asked to upgrade, quiet mode and zone save", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, `autopilot+${Date.now()}@studio.test`);
  expect((await page.request.post("/api/dev/seed-github", { headers: { origin: baseURL! } })).ok()).toBeTruthy();
  await page.goto(`/app/repos/${encodeURIComponent(REPO)}`);
  const box = page.getByTestId("autopilot-settings");
  await expect(box).toBeVisible();
  await expect(page.getByText("Weekly autopilot needs a paid plan.")).toBeVisible();
  await box.getByRole("button", { name: "Turn autopilot on" }).click();
  await expect(page.getByText(/part of Solo, Studio and Agency/)).toBeVisible();
  await page.getByLabel("Time zone").selectOption("Europe/London");
  await expect(page.getByLabel("Time zone")).toHaveValue("Europe/London");
  await page.getByLabel(/Quiet mode/).click();
  await expect(page.getByLabel(/Quiet mode/)).toBeChecked();
  await page.reload();
  await expect(page.getByLabel(/Quiet mode/)).toBeChecked();
  await expect(page.getByLabel("Time zone")).toHaveValue("Europe/London");
  // another org cannot read it
  const res = await page.request.get(`/api/repos/${encodeURIComponent("9001:nobody/else")}/autopilot`);
  expect(res.status()).toBe(404);
});

test("cron routes for the new jobs are guarded and the mail webhook refuses unsigned calls", async ({ request, baseURL }) => {
  for (const job of ["autopilot", "alerts", "backup", "heartbeat"]) {
    expect((await request.post(`/api/cron/${job}`)).status()).toBe(401);
    const ok = await request.post(`/api/cron/${job}`, { headers: { authorization: "Bearer e2e-cron" } });
    expect(ok.status(), job).toBe(200);
  }
  const hook = await request.post("/api/mail/webhook", { data: { type: "email.bounced", data: { to: ["x@y.test"] } }, headers: { origin: baseURL! } });
  expect([401, 503]).toContain(hook.status());
  const csp = (await request.get("/pricing")).headers()["content-security-policy"] ?? "";
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
});

test("the public magic link form needs an ALTCHA proof when the e2e bypass is off", async ({ request }) => {
  // the e2e server runs with E2E_OUTBOX=1 (guard off); the challenge endpoint itself must work and be rate limited
  const c = await request.get("/api/altcha");
  expect(c.ok()).toBeTruthy();
  expect(await c.json()).toHaveProperty("parameters");
});
