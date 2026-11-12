import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

const PAGES_PUBLIC = ["/", "/pricing", "/sign-in", "/security", "/docs", "/guides", "/compare/laravelshift"];
const PAGES_APP = ["/app", "/app/billing", "/app/work-orders", "/app/settings/profile", "/app/settings/members", "/app/settings/api-keys", "/app/settings/webhooks", "/app/settings/security", "/app/settings/audit"];

/** Records every Content-Security-Policy violation the browser raises, so a blocked form post or fetch can never be silent. */
async function watchCsp(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
}
// `script-src eval` on /sign-in is a bundled `is-generator-function` feature probe, `try { Function("return function*(){}")() } catch {}`:
// it is meant to be refused by our CSP and does nothing visible. Anything else (a form, a fetch, a script, an image) must be empty.
const violations = async (page: import("@playwright/test").Page) => (await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])).filter((v) => v !== "script-src eval");

test("CSP: no violation on any public or app page, and the headers are set", async ({ page, baseURL }) => {
  await watchCsp(page);
  const res = await page.goto("/");
  const h = res!.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["strict-transport-security"]).toContain("max-age");
  for (const p of PAGES_PUBLIC) {
    await page.goto(p);
    expect(await violations(page), `CSP violation on ${p}`).toEqual([]);
  }
  await signIn(page, baseURL!, `csp-${Date.now()}@studio.test`);
  await page.request.post("/api/dev/seed-github", { headers: { origin: baseURL! } });
  for (const p of PAGES_APP) {
    await page.goto(p);
    expect(await violations(page), `CSP violation on ${p}`).toEqual([]);
  }
});

test("Hangar CSV export: own repos only, safe cells, signed out is refused", async ({ browser, baseURL }) => {
  const anon = await browser.newContext({ baseURL });
  const refused = await anon.request.get("/api/repos/export");
  expect([401, 403]).toContain(refused.status());
  await anon.close();

  const a = await browser.newContext({ baseURL });
  const pa = await a.newPage();
  await signIn(pa, baseURL!, `csv-a-${Date.now()}@studio.test`, "Org A");
  await pa.request.post("/api/dev/seed-github", { headers: { origin: baseURL! } });
  const mine = await pa.request.get("/api/repos/export");
  expect(mine.status()).toBe(200);
  expect(mine.headers()["content-type"]).toContain("text/csv");
  expect(mine.headers()["content-disposition"]).toContain("attachment");
  const text = await mine.text();
  expect(text.split("\r\n").length).toBeGreaterThan(2);
  expect(text).toMatch(/^﻿repository,/);
  // the button is on the Hangar
  await pa.goto("/app");
  await expect(pa.getByRole("link", { name: "Export CSV" })).toBeVisible();

  const b = await browser.newContext({ baseURL });
  const pb = await b.newPage();
  await signIn(pb, baseURL!, `csv-b-${Date.now()}@studio.test`, "Org B");
  const theirs = await (await pb.request.get("/api/repos/export")).text();
  expect(theirs.trim().split("\r\n")).toHaveLength(1); // header only: nothing of org A
  await pb.goto("/app");
  await expect(pb.getByRole("link", { name: "Export CSV" })).toHaveCount(0);
  await a.close(); await b.close();
});

test("health reports dependency state and leaks nothing", async ({ request }) => {
  const r = await request.get("/api/health");
  expect(r.status()).toBe(200);
  const body = await r.json();
  expect(body.ok).toBe(true);
  expect(body.deps.db).toBe("ok");
  expect(["configured", "missing"]).toContain(body.deps.billing);
  const raw = JSON.stringify(body);
  expect(raw).not.toMatch(/mongodb|sk_|whsec_|re_[A-Za-z0-9]{10}|secret|password|@/i);
});

test("session revoked mid-use: APIs answer 401 JSON and pages go to sign-in, never a blank page", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, `exp-${Date.now()}@studio.test`);
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Hangar" })).toBeVisible();
  await page.context().clearCookies(); // what an expired or revoked session looks like to the server
  const api = await page.request.post("/api/runs", { data: { repoId: "x", hopFrom: 11 }, headers: { origin: baseURL! } });
  expect([401, 403]).toContain(api.status());
  expect((await api.json()).error).toBeTruthy();
  await page.goto("/app/billing");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("button", { name: /magic link|email me|send/i }).first()).toBeVisible();
});

test("the no-op probe is closed to normal users, and run bodies with huge or hostile input are refused cleanly", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, `noop-${Date.now()}@studio.test`);
  const noop = await page.request.post("/api/runs", { data: { repoId: "x", hopFrom: 11, kind: "noop" }, headers: { origin: baseURL! } });
  expect(noop.status()).toBe(403);
  for (const data of [{ repoId: "x".repeat(50_000), hopFrom: 11 }, { repoId: "<script>alert(1)</script>", hopFrom: 11, appPath: "../../etc" }]) {
    const r = await page.request.post("/api/runs", { data, headers: { origin: baseURL! } });
    expect(r.status()).toBeLessThan(500);
    expect((await r.json()).error).toBeTruthy();
  }
});

test("a cross-site POST is refused", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, `csrf-${Date.now()}@studio.test`);
  const r = await page.request.post("/api/runs", { data: { repoId: "x", hopFrom: 11 }, headers: { origin: "https://evil.example" } });
  expect(r.status()).toBe(403);
});
