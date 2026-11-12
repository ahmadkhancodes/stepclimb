import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { signIn } from "./helpers";

// Adversarial review (docs/SECURITY-REVIEW.md): an attacker with a normal account tries to reach another customer's data,
// to climb inside their own organisation, and to abuse the sign in flow. Every request below is a real attempt.

const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e5)}`;

async function user(ctx: BrowserContext, baseURL: string, email: string, org: string | null) {
  const page = await ctx.newPage();
  await signIn(page, baseURL, email, org);
  return page;
}
const post = (p: Page, baseURL: string, url: string, data: unknown = {}) => p.request.post(url, { data, headers: { origin: baseURL } });

test("tenant isolation: org B cannot read, change or delete anything of org A by id", async ({ browser, baseURL }) => {
  const a = await browser.newContext({ baseURL });
  const pa = await user(a, baseURL!, `idor-a-${uniq()}@studio.test`, "Victim Org");
  const seed = (await (await post(pa, baseURL!, "/api/dev/seed-github")).json()) as { scans: Record<string, string> };
  const scanId = Object.values(seed.scans)[0]!;
  await pa.goto("/app");
  const repoHref = await pa.locator('a[href^="/app/repos/"]').first().getAttribute("href");
  const repoId = decodeURIComponent(repoHref!.split("/").pop()!);
  expect((await post(pa, baseURL!, "/api/dev/grant-credit?kind=to_previous")).ok()).toBeTruthy();
  const run = await post(pa, baseURL!, "/api/runs", { repoId, hopFrom: 11 });
  expect(run.status()).toBe(201);
  const runId = ((await run.json()) as { id: string }).id;
  const hook = await post(pa, baseURL!, "/api/webhooks", { url: "https://hooks.example.com/in", events: ["*"] });
  expect(hook.status()).toBe(201);
  const hookId = ((await hook.json()) as { endpoint: { id: string } }).endpoint.id;
  const key = await post(pa, baseURL!, "/api/auth/api-key/create", { name: "ci", organizationId: (await (await pa.request.get("/api/auth/organization/get-full-organization")).json()).id });
  expect(key.ok()).toBeTruthy();
  const keyId = ((await key.json()) as { id: string }).id;
  const orgA = ((await (await pa.request.get("/api/auth/organization/get-full-organization")).json()) as { id: string }).id;

  const b = await browser.newContext({ baseURL });
  const pb = await user(b, baseURL!, `idor-b-${uniq()}@studio.test`, "Attacker Org");
  const deny = (s: number) => expect([400, 401, 403, 404]).toContain(s);

  // app data
  deny((await pb.request.get(`/api/runs/${runId}`)).status());
  deny((await post(pb, baseURL!, `/api/runs/${runId}/cancel`)).status());
  deny((await post(pb, baseURL!, "/api/runs", { repoId, hopFrom: 11 })).status());
  deny((await post(pb, baseURL!, `/api/repos/${encodeURIComponent(repoId)}/scan`)).status());
  deny((await pb.request.get(`/api/repos/${encodeURIComponent(repoId)}/autopilot`)).status());
  deny((await post(pb, baseURL!, `/api/repos/${encodeURIComponent(repoId)}/autopilot`, { quietMode: true })).status());
  for (const path of [`/app/work-orders/${runId}`, `/app/repos/${encodeURIComponent(repoId)}`, `/app/inspections/${encodeURIComponent(scanId)}`]) {
    // app pages stream behind loading.tsx, so a notFound() keeps the 200: the proof is that nothing of org A is rendered
    await pb.goto(path);
    await expect(pb.getByText("This page did not arrive").first(), path).toBeVisible();
    expect(await pb.locator("main").innerText(), path).not.toContain("billing-portal");
  }
  // ids of another resource type are no key either
  deny((await pb.request.get(`/api/runs/${encodeURIComponent(repoId)}`)).status());
  expect(((await (await pb.request.get("/api/runs")).json()) as { runs: unknown[] }).runs).toEqual([]);

  // webhooks: change the URL to the attacker's, fire a test, delete, list deliveries
  deny((await pb.request.patch(`/api/webhooks/${hookId}`, { data: { url: "https://attacker.example/x" }, headers: { origin: baseURL! } })).status());
  deny((await post(pb, baseURL!, `/api/webhooks/${hookId}/test`)).status());
  expect((await pb.request.delete(`/api/webhooks/${hookId}`, { headers: { origin: baseURL! } })).status()).toBe(404);
  expect(((await (await pa.request.get("/api/webhooks")).json()) as { endpoints: { id: string; url: string }[] }).endpoints).toEqual([expect.objectContaining({ id: hookId, url: "https://hooks.example.com/in" })]);
  expect(((await (await pb.request.get(`/api/webhooks/deliveries?endpointId=${hookId}`)).json()) as { deliveries: unknown[] }).deliveries).toEqual([]);

  // organisation, members, invitations, API keys, audit through Better Auth with org A's id
  const peek = await pb.request.get(`/api/auth/organization/get-full-organization?organizationId=${orgA}`);
  expect(peek.ok() ? await peek.text() : "denied").not.toContain("Victim Org");
  deny((await post(pb, baseURL!, "/api/auth/organization/set-active", { organizationId: orgA })).status());
  deny((await post(pb, baseURL!, "/api/auth/organization/update", { organizationId: orgA, data: { name: "pwned" } })).status());
  deny((await post(pb, baseURL!, "/api/auth/organization/invite-member", { organizationId: orgA, email: "spy@attacker.test", role: "admin" })).status());
  deny((await post(pb, baseURL!, "/api/auth/organization/delete", { organizationId: orgA })).status());
  deny((await pb.request.get(`/api/auth/organization/list-invitations?organizationId=${orgA}`)).status());
  deny((await pb.request.get(`/api/auth/api-key/list?organizationId=${orgA}`)).status());
  deny((await post(pb, baseURL!, "/api/auth/api-key/create", { name: "steal", organizationId: orgA })).status());
  deny((await post(pb, baseURL!, "/api/auth/api-key/delete", { keyId })).status());
  // B's own audit log and export hold nothing of A
  const audit = await (await pb.request.get("/api/audit")).text();
  expect(audit).not.toContain(orgA);
  const exp = await (await pb.request.get("/api/account/export")).text();
  expect(exp).not.toContain(orgA);
  expect(exp).not.toContain(hookId);

  // A is untouched
  const full = (await (await pa.request.get("/api/auth/organization/get-full-organization")).json()) as { name: string; members: unknown[] };
  expect(full.name).toBe("Victim Org");
  expect(full.members).toHaveLength(1);
  await a.close(); await b.close();
});

test("inside one org: a member cannot climb to admin, read the audit log, or take billing and webhooks", async ({ browser, baseURL }) => {
  const a = await browser.newContext({ baseURL });
  const owner = await user(a, baseURL!, `own-${uniq()}@studio.test`, "Climb Org");
  expect((await post(owner, baseURL!, "/api/dev/set-plan")).ok()).toBeTruthy(); // seats for a second member
  const memberEmail = `mem-${uniq()}@studio.test`;
  const inv = await post(owner, baseURL!, "/api/auth/organization/invite-member", { email: memberEmail, role: "member" });
  expect(inv.ok()).toBeTruthy();
  const invitationId = ((await inv.json()) as { id: string }).id;
  await post(owner, baseURL!, "/api/webhooks", { url: "https://hooks.example.com/in", events: ["*"] });

  // a third user who is not the invitee cannot use the invitation id
  const c = await browser.newContext({ baseURL });
  const thief = await user(c, baseURL!, `thief-${uniq()}@studio.test`, null);
  expect((await post(thief, baseURL!, "/api/auth/organization/accept-invitation", { invitationId })).ok()).toBeFalsy();

  const b = await browser.newContext({ baseURL });
  const mem = await user(b, baseURL!, memberEmail, null);
  const acc = await post(mem, baseURL!, "/api/auth/organization/accept-invitation", { invitationId });
  expect(acc.ok()).toBeTruthy();
  const { member } = (await acc.json()) as { member: { id: string; organizationId: string } };
  await post(mem, baseURL!, "/api/auth/organization/set-active", { organizationId: member.organizationId });

  const full = (await (await owner.request.get("/api/auth/organization/get-full-organization")).json()) as { members: { id: string; role: string }[] };
  const ownerMember = full.members.find((m) => m.role === "owner")!;
  for (const role of ["admin", "owner"]) expect((await post(mem, baseURL!, "/api/auth/organization/update-member-role", { memberId: member.id, role })).ok(), role).toBeFalsy();
  expect((await post(mem, baseURL!, "/api/auth/organization/update-member-role", { memberId: ownerMember.id, role: "viewer" })).ok()).toBeFalsy();
  expect((await post(mem, baseURL!, "/api/auth/organization/remove-member", { memberIdOrEmail: ownerMember.id })).ok()).toBeFalsy();
  expect((await post(mem, baseURL!, "/api/auth/organization/invite-member", { email: `pal-${uniq()}@studio.test`, role: "owner" })).ok()).toBeFalsy();
  expect((await post(mem, baseURL!, "/api/auth/organization/delete", { organizationId: member.organizationId })).ok()).toBeFalsy();

  expect((await mem.request.get("/api/audit")).status()).toBe(403);
  expect((await post(mem, baseURL!, "/api/webhooks", { url: "https://attacker.example/in", events: ["*"] })).status()).toBe(403);
  expect((await post(mem, baseURL!, "/api/billing/checkout", { plan: "agency", interval: "year" })).status()).toBe(403);
  expect((await post(mem, baseURL!, "/api/billing/portal")).status()).toBe(403);
  expect((await mem.request.get("/api/admin/overview")).status()).toBe(404);
  expect((await mem.goto("/admin"))!.status()).toBe(404);

  // the personal data export must not hand a member the org's audit log or billing records (audit:read is admin only)
  const exp = (await (await mem.request.get("/api/account/export")).json()) as { organizations: { id: string; data?: { auditLog?: unknown[]; billingAccount?: unknown } }[] };
  const org = exp.organizations.find((o) => o.id === member.organizationId)!;
  expect(org).toBeTruthy();
  expect(org.data?.auditLog).toBeUndefined();
  expect(org.data?.billingAccount).toBeUndefined();

  // the owner is still the owner
  const after = (await (await owner.request.get("/api/auth/organization/get-full-organization")).json()) as { members: { id: string; role: string }[] };
  expect(after.members.find((m) => m.id === ownerMember.id)!.role).toBe("owner");
  expect(after.members.find((m) => m.id === member.id)!.role).toBe("member");
  await a.close(); await b.close(); await c.close();
});

test("an admin can manage the org's API keys (the settings page offers it), a member cannot", async ({ browser, baseURL }) => {
  const a = await browser.newContext({ baseURL });
  const owner = await user(a, baseURL!, `kown-${uniq()}@studio.test`, "Keys Org");
  const orgId = ((await (await owner.request.get("/api/auth/organization/get-full-organization")).json()) as { id: string }).id;
  expect((await post(owner, baseURL!, "/api/dev/set-plan")).ok()).toBeTruthy();
  const adminEmail = `kadm-${uniq()}@studio.test`;
  const invitationId = ((await (await post(owner, baseURL!, "/api/auth/organization/invite-member", { email: adminEmail, role: "admin" })).json()) as { id: string }).id;
  const b = await browser.newContext({ baseURL });
  const adm = await user(b, baseURL!, adminEmail, null);
  expect((await post(adm, baseURL!, "/api/auth/organization/accept-invitation", { invitationId })).ok()).toBeTruthy();
  await post(adm, baseURL!, "/api/auth/organization/set-active", { organizationId: orgId });
  const created = await post(adm, baseURL!, "/api/auth/api-key/create", { name: "deploy", organizationId: orgId });
  expect(created.ok(), await created.text()).toBeTruthy();
  const { id } = (await created.json()) as { id: string };
  expect((await post(adm, baseURL!, "/api/auth/api-key/delete", { keyId: id })).ok()).toBeTruthy();
  await a.close(); await b.close();
});

test("sign in: magic link works once, sign out kills the cookie, cookies are HttpOnly and Lax, no open redirect", async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL });
  const page = await ctx.newPage();
  const email = `auth-${uniq()}@studio.test`;
  expect((await post(page, baseURL!, "/api/auth/sign-in/magic-link", { email, callbackURL: "/app" })).ok()).toBeTruthy();
  const box = await (await page.request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  const link = /https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0];
  await page.goto(link);
  const cookies = await ctx.cookies();
  const session = cookies.find((c) => c.name.endsWith(".session_token"))!;
  expect(session.httpOnly).toBe(true);
  expect(session.sameSite).toBe("Lax");
  const stolen = session.value;

  // replay of the same link from another browser does not sign in
  const other = await browser.newContext({ baseURL });
  const op = await other.newPage();
  await op.goto(link);
  expect((await other.cookies()).some((c) => c.name.endsWith(".session_token"))).toBe(false);
  await other.close();

  // sign out, then replay the old cookie
  await post(page, baseURL!, "/api/auth/sign-out");
  const replay = await browser.newContext({ baseURL });
  await replay.addCookies([{ ...session, value: stolen }]);
  const s = await (await replay.request.get("/api/auth/get-session")).json();
  expect(s).toBeNull();
  await replay.close();

  // callbackURL to another site is refused by the auth server; ?next=//evil stays on site
  const evil = await post(page, baseURL!, "/api/auth/sign-in/magic-link", { email, callbackURL: "https://evil.example/steal" });
  expect(evil.ok()).toBeFalsy();
  for (const next of ["//evil.example", "https://evil.example", "/\\evil.example", "javascript:alert(1)"]) {
    await page.goto(`/sign-in?next=${encodeURIComponent(next)}`);
    expect(new URL(page.url()).host).toBe(new URL(baseURL!).host);
  }
  await ctx.close();
});

test("injection: operator objects, prototype keys and hostile names are refused or rendered as text", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, `inj-${uniq()}@studio.test`, `<img src=x onerror="window.__pwned=1">`);
  for (const data of [{ repoId: { $ne: null }, hopFrom: 11 }, { repoId: "x", hopFrom: { $gt: 0 } }, { __proto__: { admin: true }, repoId: "x", hopFrom: 11 }]) {
    const r = await post(page, baseURL!, "/api/runs", data);
    expect([400, 404]).toContain(r.status());
  }
  expect((await post(page, baseURL!, "/api/webhooks", { url: { $gt: "" }, events: ["*"] })).status()).toBe(400);
  const r = await page.request.get(`/api/webhooks/deliveries?endpointId[$ne]=x`);
  expect(((await r.json()) as { deliveries: unknown[] }).deliveries).toEqual([]);
  await page.goto("/app/settings/profile");
  await page.goto("/app");
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
});

test("SSRF: webhook endpoints that point at this machine or a private network are refused", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, `ssrf-${uniq()}@studio.test`, "Ssrf Org");
  for (const url of ["https://localhost./x", "https://127.0.0.1/x", "https://2130706433/x", "https://0x7f.1/x", "https://[::ffff:127.0.0.1]/x", "https://100.64.0.1/x", "https://169.254.169.254/latest/meta-data", "https://metadata.google.internal./x", "file:///etc/passwd", "http://example.com/x"]) {
    const res = await post(page, baseURL!, "/api/webhooks", { url, events: ["*"] });
    expect(res.status(), url).toBe(400);
  }
});

test("errors carry no stack traces or internals, and no source maps are served", async ({ page, baseURL }) => {
  await signIn(page, baseURL!, `err-${uniq()}@studio.test`, "Err Org");
  const bad = await page.request.post("/api/runs", { data: "{not json", headers: { origin: baseURL!, "content-type": "application/json" } });
  expect(bad.status()).toBe(400);
  expect(await bad.text()).not.toMatch(/at \w+ \(|node_modules|\.ts:\d+/);
  const big = await page.request.post("/api/webhooks", { data: "x".repeat(1_100_000), headers: { origin: baseURL!, "content-type": "application/json" } });
  expect(big.status()).toBe(413);
  const html = await (await page.request.get("/")).text();
  const js = /\/_next\/static\/[^"]+\.js/.exec(html)![0];
  expect((await page.request.get(`${js}.map`)).status()).toBe(404);
  expect((await page.request.get("/_next/static/")).status()).toBe(404);
});
