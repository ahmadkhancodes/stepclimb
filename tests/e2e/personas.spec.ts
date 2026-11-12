import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { meCurl } from "../../src/content/docs/snippets";
import { product } from "../../src/config/product";
import { getDoc } from "../../src/content/docs";
import { signIn, watch } from "./qa/helpers";

// Persona walk-throughs from docs/QA-REPORT.md ("Usefulness pass 2"). GitHub install is stood in by /api/dev/seed-github
// (fixture GitHub), Stripe by its absence (stub mode) plus /api/dev/set-plan (what the webhook writes).

const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e4)}`;
const sh = (cmd: string) => execFileSync("bash", ["-c", cmd], { encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "ignore"] });

async function createKeyInUi(page: Page) {
  await page.goto("/app/settings/api-keys");
  await page.getByLabel("Name").fill("Production server");
  await page.getByRole("button", { name: "Create key" }).click();
  const snippet = page.locator("[data-snippet]");
  await expect(snippet).toBeVisible();
  const key = (await page.locator("[role=status] code").first().innerText()).trim();
  return { key, snippet: await snippet.innerText() };
}

test("first ten minutes: landing to first inspection report within a click budget", async ({ page, baseURL }) => {
  const problems = watch(page);
  const email = `sam+${uniq()}@solo.test`;
  let clicks = 0;
  const click = async (l: ReturnType<Page["getByRole"]>) => { clicks++; await l.click(); };
  await page.goto("/");
  await click(page.getByRole("link", { name: "Inspect a repo free" }).first());
  await expect(page).toHaveURL(/sign-in/);
  await page.getByLabel(/email/i).first().fill(email);
  await click(page.getByRole("button", { name: /email me a sign-in link/i }).first());
  await expect(page.getByText(/check your (inbox|email)|we.ve sent|link (is )?on its way/i).first()).toBeVisible({ timeout: 20_000 });
  await expect.poll(async () => ((await (await page.request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json()).messages ?? []).length).toBeGreaterThan(0);
  const box = await (await page.request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  clicks++; // the link in the e-mail
  await page.goto(/https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0]);
  await page.getByLabel(/name/i).first().fill("Sam Builds");
  await click(page.getByRole("button", { name: /create/i }).first());
  await expect(page.getByRole("heading", { name: "Hangar", level: 1 })).toBeVisible();
  // the empty Hangar says what the next step is and that the free plan has no repo meter to fill
  await expect(page.getByText("No airframes yet")).toBeVisible();
  await expect(page.getByText("Not on this plan")).toBeVisible();
  await expect(page.getByText("0 of 0")).toHaveCount(0);
  // GitHub App install stand-in (one install on GitHub counts as one click)
  clicks++;
  expect((await page.request.post("/api/dev/seed-github", { headers: { origin: baseURL! } })).ok()).toBeTruthy();
  await page.goto("/app");
  await click(page.getByRole("link", { name: "Open inspection" }).first());
  await expect(page.getByRole("heading", { name: /inspection/i, level: 1 })).toBeVisible();
  await expect(page.getByText(/Start work order: Laravel \d+ to \d+/).first()).toBeVisible();
  expect(clicks).toBeLessThanOrEqual(6);
  expect(problems).toEqual([]);
});

test("Solo Sam, day 2: the API key snippet works as shown, with the real key", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, `sam2+${uniq()}@solo.test`, "Sam Builds");
  const { key, snippet } = await createKeyInUi(page);
  expect(snippet).toBe(meCurl(baseURL!, key));
  const orgId = ((await (await page.request.get("/api/auth/organization/get-full-organization")).json()) as { id: string }).id;
  expect(JSON.parse(sh(snippet))).toEqual({ orgId });
});

test("Solo Sam, day 7: plans read right, the 6 month plans say so, a canceled checkout says nothing was charged", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, `sam7+${uniq()}@solo.test`);
  await page.goto("/app/billing?plan=legacy_solo");
  await expect(page.getByText("You picked Legacy Solo billed every 6 months on the pricing page.")).toBeVisible();
  await expect(page.getByText(/per half|Billed monthly only/)).toHaveCount(0);
  await expect(page.getByText("Billed every 6 months only.").first()).toBeVisible();
  await page.getByRole("button", { name: "Monthly" }).click();
  await expect(page.getByText("$49 per repo per year")).toBeVisible();
  await page.goto("/app/billing?checkout=canceled");
  await expect(page.getByText("Checkout canceled")).toBeVisible();
  await expect(page.getByText(/Nothing was charged and your plan did not change/)).toBeVisible();
  // stub mode (no Stripe key here): choosing a plan explains instead of failing silently
  await page.goto("/app/billing");
  await page.getByRole("button", { name: "Choose Agency" }).click();
  await expect(page.getByText(/Billing is not connected yet|That did not go through/)).toBeVisible();
});

test("Agency Alex, day 2: a full seat count is explained before the invite, and member.invited reaches the webhook log", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, `alex+${uniq()}@agency.test`, "Kestrel Digital");
  const hook = await page.request.post("/api/webhooks", { data: { url: "https://hooks.example.com/stepclimb", events: ["member.invited"] }, headers: { origin: baseURL! } });
  expect(hook.status()).toBe(201);
  await page.goto("/app/settings/members");
  await expect(page.getByText("All 1 seat on Free inspection are taken")).toBeVisible();
  await expect(page.getByRole("link", { name: "See plans with more seats" })).toHaveAttribute("href", "/app/billing");
  await page.getByLabel("Email").fill(`dev+${uniq()}@agency.test`);
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(/Invitation sent to/)).toBeVisible();
  await expect.poll(async () => ((await (await page.request.get("/api/webhooks/deliveries")).json()).deliveries as { event: string }[]).map((d) => d.event), { timeout: 20_000 }).toContain("member.invited");

  // day 7: the owner upgrades (what the Stripe webhook writes); the seat notice goes away
  expect((await page.request.post("/api/dev/set-plan", { headers: { origin: baseURL! } })).ok()).toBeTruthy();
  await page.goto("/app/settings/members");
  await expect(page.getByRole("heading", { name: "Invite a teammate" })).toBeVisible();
  await expect(page.getByText(/seats? on .* are taken/)).toHaveCount(0);
  await page.goto("/app/billing");
  await expect(page.getByText("Agency").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Manage billing" })).toBeVisible();
});

test("docs work: the authentication curl, the API error sample and the export step run against the app", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, `docs+${uniq()}@priya.test`, "Ledgerline");
  const { key } = await createKeyInUi(page);
  const orgId = ((await (await page.request.get("/api/auth/organization/get-full-organization")).json()) as { id: string }).id;

  const auth = getDoc("authentication")!.sections.find((s) => s.code)!.code!.code;
  const local = auth.replaceAll(product.url, baseURL!);
  expect(JSON.parse(sh(local.replace("YOUR_API_KEY", key)))).toEqual({ orgId });

  const api = getDoc("api")!;
  const meSample = JSON.parse(api.sections.find((s) => s.heading === "GET /api/v1/me")!.code!.code) as Record<string, string>;
  expect(Object.keys(meSample)).toEqual(["orgId"]);
  const errSample = JSON.parse(api.sections.find((s) => s.heading === "Errors")!.code!.code);
  expect(JSON.parse(sh(`${local.replace("YOUR_API_KEY", "step_not_a_real_key")} -s`))).toEqual(errSample);

  // "GET /api/account/export returns a JSON copy of your account data" (signed in session)
  const exp = await page.request.get("/api/account/export");
  expect(exp.ok()).toBeTruthy();
  expect(exp.headers()["content-type"]).toContain("json");
  // the in-app docs page renders the same command
  await page.goto("/docs/authentication");
  await expect(page.locator("pre").filter({ hasText: "/api/v1/me" }).first()).toContainText('-H "x-api-key: YOUR_API_KEY"');
});
