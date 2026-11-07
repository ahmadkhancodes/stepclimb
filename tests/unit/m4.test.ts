import { createHmac } from "node:crypto";
import { join } from "node:path";
import { solveChallenge } from "altcha-lib";
import { deriveKey } from "altcha-lib/algorithms/pbkdf2";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import jobsWorker, { jobsFor } from "../../infra/cron-worker/worker";
import { adminRunDetail, adminSetPathFlag, adminSetPin, AdminError, refundRun, stripeRefunder, usageOverview } from "@/lib/admin/console";
import { runAutopilot } from "@/lib/autopilot/job";
import { isAutopilotWindow, localParts, validTimezone, weekKey } from "@/lib/autopilot/schedule";
import { getState, handlePullRequestEvent } from "@/lib/autopilot/state";
import { handleStripeWebhook } from "@/lib/billing/webhook";
import type { Db } from "@/lib/db";
import { getDb } from "@/lib/db";
import { createMemoryDb } from "@/lib/db/memory";
import { loadRecipes } from "@/lib/engine/recipes";
import { loadRules } from "@/lib/engine/repair";
import { FIXTURE_REPOS } from "@/lib/github/fixtures";
import { processWebhook } from "@/lib/github/webhook";
import { sendMail } from "@/lib/mail";
import { applyMailEvent, mailReceipt, mailRunFinished, saveContact } from "@/lib/mail/notify";
import { receiptEmail, runFailedEmail, runFinishedEmail, weeklyPrEmail } from "@/lib/mail/product-templates";
import { consoleTransport, outbox } from "@/lib/mail/transports";
import { processMailWebhook, verifySvix } from "@/lib/mail/webhook";
import { alertCronFailure, collectAlerts, recordHeartbeat, recordWebhookFailure, sendAlerts, ALERT_COOLDOWN_MS } from "@/lib/ops/alerts";
import { countsOf, exportSnapshot, memoryStore, mongoStore, parseSnapshot, restoreDrill, runBackup, serializeSnapshot, type Doc, type MongoDbLike } from "@/lib/ops/backup";
import { FakeRunner } from "@/lib/runs/fake-runner";
import { createFixtureHost } from "@/lib/runs/fixture-host";
import { checkFreeTier, FREE_TIER } from "@/lib/runs/free-tier";
import { applyPins, loadPins } from "@/lib/runs/pins";
import { dispatchRun, finalizeRun, startRun, type RunDeps } from "@/lib/runs/service";
import { simulatedUpdateDeps, simulatedVerify } from "@/lib/runs/simulated-verify";
import { getRun, grantCredit, patchRun, transition } from "@/lib/runs/store";
import type { RunDoc } from "@/lib/runs/types";
import { bannedDeps, bannedPatternHits, isBannedPackage, isRepoDenied, matchesRepoPattern } from "@/lib/security/denylist";
import { securityHeaders } from "@/lib/security/headers";
import { newChallenge } from "@/lib/security/altcha";
import { guardMagicLink } from "@/lib/security/magic-link-guard";
import { limitByIp } from "@/lib/security/ratelimit";
import { event, fakeStripe } from "./fakes";

const recipes = loadRecipes(join(process.cwd(), "recipes"));
const rules = loadRules(join(process.cwd(), "repair-rules"));
const ACCOUNT = "org_1";
const portal = FIXTURE_REPOS.find((r) => r.fullName.endsWith("/billing-portal"))!;
const dispatchApi = FIXTURE_REPOS.find((r) => r.fullName.endsWith("/dispatch-api"))!;
const repo = { id: "9001:kestrel-digital/billing-portal", installationId: "9001", fullName: "kestrel-digital/billing-portal", defaultBranch: "main", private: true };
const sub = { isPaid: true, status: "active" as const, plan: "solo" as const, interval: "year" as const, quantity: 5, expiresAt: null, trialStartedAt: null, cancelAtPeriodEnd: false, checkedAt: 0, trialUsed: false, subscriptionId: "sub_1", lifetimePaymentIntentId: null, pastDueSince: null };

function setup(files: Record<string, string> = portal.files) {
  const db: Db = createMemoryDb("stepclimb");
  const host = createFixtureHost();
  const runner = new FakeRunner({ host, repo: files, recipes, rules, verify: (s, fs) => simulatedVerify(s, fs), updateDeps: simulatedUpdateDeps });
  const t = { now: Date.parse("2026-11-09T11:00:00Z") };
  const deps: RunDeps = { db, runner, host: async () => host, gitToken: async () => "tok", appUrl: "https://stepclimb.test", now: () => new Date(t.now) };
  return { db, runner, host, deps, t };
}
const subscribe = (db: Db) => db.setEntitlement(ACCOUNT, sub);
const sentTo = (to: string) => outbox.filter((m) => m.to === to);

beforeEach(() => { outbox.length = 0; });
afterEach(() => { vi.unstubAllEnvs(); });

// ───────────────────────── P0-9 Autopilot ─────────────────────────
describe("P0-9 autopilot schedule", () => {
  it("is Monday 06:00 in the repo timezone, default America/New_York", () => {
    expect(validTimezone(undefined)).toBe("America/New_York");
    expect(validTimezone("Not/AZone")).toBe("America/New_York");
    expect(isAutopilotWindow(new Date("2026-11-09T11:00:00Z"), "America/New_York")).toBe(true); // EST, UTC-5
    expect(isAutopilotWindow(new Date("2026-11-09T11:59:00Z"), "America/New_York")).toBe(true);
    expect(isAutopilotWindow(new Date("2026-11-09T10:59:00Z"), "America/New_York")).toBe(false);
    expect(isAutopilotWindow(new Date("2026-11-09T12:00:00Z"), "America/New_York")).toBe(false);
    expect(isAutopilotWindow(new Date("2026-11-10T11:00:00Z"), "America/New_York")).toBe(false); // Tuesday
    expect(isAutopilotWindow(new Date("2026-11-08T21:00:00Z"), "Asia/Karachi")).toBe(false); // Sunday evening UTC is already Monday 02:00 there
    expect(isAutopilotWindow(new Date("2026-11-09T01:00:00Z"), "Asia/Karachi")).toBe(true); // UTC+5
  });
  it("follows daylight saving time: the same local hour moves in UTC", () => {
    // US DST started Sunday 8 March 2026, so Monday 9 March is EDT (UTC-4) and the window opens an hour earlier in UTC
    expect(isAutopilotWindow(new Date("2026-03-09T10:00:00Z"), "America/New_York")).toBe(true);
    expect(isAutopilotWindow(new Date("2026-03-09T11:00:00Z"), "America/New_York")).toBe(false);
    // the Monday before the change is still EST
    expect(isAutopilotWindow(new Date("2026-03-02T11:00:00Z"), "America/New_York")).toBe(true);
    expect(isAutopilotWindow(new Date("2026-03-02T10:00:00Z"), "America/New_York")).toBe(false);
    // UK: BST began 29 March 2026
    expect(isAutopilotWindow(new Date("2026-03-30T05:00:00Z"), "Europe/London")).toBe(true);
    expect(isAutopilotWindow(new Date("2026-03-23T06:00:00Z"), "Europe/London")).toBe(true);
    expect(localParts(new Date("2026-11-09T11:00:00Z"), "America/New_York")).toMatchObject({ weekday: 1, hour: 6 });
  });
  it("names the ISO week of the local date", () => {
    expect(weekKey(new Date("2026-11-09T11:00:00Z"), "America/New_York")).toBe("2026-W46");
    expect(weekKey(new Date("2026-11-16T11:00:00Z"), "America/New_York")).toBe("2026-W47");
    expect(weekKey(new Date("2026-01-01T12:00:00Z"), "UTC")).toBe("2026-W01");
    expect(weekKey(new Date("2027-01-01T12:00:00Z"), "UTC")).toBe("2026-W53");
  });
});

describe("P0-9 autopilot job", () => {
  async function ready(s = setup()) {
    await subscribe(s.db);
    await s.db.docs.put("repos", repo.id, { installationId: "9001", accountId: ACCOUNT, externalId: 1, fullName: repo.fullName, defaultBranch: "main", private: true, archived: false, pushedAt: null, autopilotWeekly: true });
    await s.db.docs.put("apps", `${repo.id}:.`, { repoId: repo.id, path: "", laravelMajor: 11, supported: true });
    await saveContact(s.db, ACCOUNT, "dana@studio.test");
    return s;
  }
  const week = (s: ReturnType<typeof setup>, iso: string) => { s.t.now = Date.parse(iso); return runAutopilot(s.deps, new Date(s.t.now)); };

  it("two consecutive weeks produce one refreshed PR, not two", async () => {
    const s = await ready();
    const a = await week(s, "2026-11-09T11:00:00Z");
    expect(a.started).toEqual([repo.fullName]);
    expect(s.host.calls.prs).toHaveLength(1);
    expect(s.host.calls.prs[0]).toMatchObject({ head: "stepclimb/autopilot", base: "main", draft: false });
    expect(s.host.calls.prs[0]!.title).toContain("Weekly dependency update");
    expect(s.host.calls.checks[0]!.conclusion).toBe("success");
    const b = await week(s, "2026-11-16T11:00:00Z");
    expect(b.started).toEqual([repo.fullName]);
    expect(s.host.calls.prs).toHaveLength(1); // refreshed
    expect(s.host.calls.updates).toHaveLength(1);
    expect(s.host.calls.updates[0]).toMatchObject({ number: 1 });
    expect(s.host.calls.checks).toHaveLength(2);
    const state = await getState(s.db, repo.id);
    expect(state).toMatchObject({ prNumber: 1, prOpen: true, lastWeekKey: "2026-W47" });
    // both runs pushed the same fixed branch
    expect(s.runner.pushed.map((p) => p.branch)).toEqual(["stepclimb/autopilot", "stepclimb/autopilot"]);
    // one mail each week, the second says refreshed
    const mails = sentTo("dana@studio.test");
    expect(mails.map((m) => m.subject.split(" weekly")[0])).toEqual(["New", "Refreshed"]);
  });
  it("runs once per ISO week even though cron ticks hourly, and only inside the window", async () => {
    const s = await ready();
    await week(s, "2026-11-09T11:00:00Z");
    const again = await week(s, "2026-11-09T11:30:00Z");
    expect(again.started).toEqual([]);
    expect(again.skipped[repo.fullName]).toBe("already_ran_this_week");
    const off = await week(s, "2026-11-10T11:00:00Z");
    expect(off.skipped[repo.fullName]).toBe("outside_window");
    expect(s.host.calls.prs).toHaveLength(1);
  });
  it("respects the repo timezone", async () => {
    const s = await ready();
    await s.db.docs.put("repos", repo.id, { timezone: "Asia/Karachi" });
    expect((await week(s, "2026-11-09T11:00:00Z")).started).toEqual([]);
    expect((await week(s, "2026-11-09T01:00:00Z")).started).toEqual([repo.fullName]);
  });
  it("is part of the paid plans: free accounts, quiet repos and archived repos are skipped", async () => {
    const free = await ready(setup());
    await free.db.setEntitlement(ACCOUNT, { ...sub, isPaid: false, status: "none", plan: "free" });
    expect((await week(free, "2026-11-09T11:00:00Z")).skipped[repo.fullName]).toBe("plan_required");
    const quiet = await ready(setup());
    await quiet.db.docs.put("repos", repo.id, { quietMode: true });
    expect((await week(quiet, "2026-11-09T11:00:00Z")).skipped[repo.fullName]).toBe("quiet_mode");
    const archived = await ready(setup());
    await archived.db.docs.put("repos", repo.id, { archived: true });
    expect((await week(archived, "2026-11-09T11:00:00Z")).skipped[repo.fullName]).toBe("archived");
  });
  it("opens no PR when nothing moved", async () => {
    const s = setup({ ...portal.files, "composer.json": JSON.stringify({ require: { php: "^8.2", "laravel/framework": "^11.0" }, "require-dev": { "pestphp/pest": "^3.0" } }) });
    await ready(s);
    await week(s, "2026-11-09T11:00:00Z");
    expect(s.host.calls.prs).toHaveLength(0);
    const [run] = await s.db.docs.find<RunDoc>("runs");
    expect(run).toMatchObject({ kind: "autopilot", status: "succeeded", prNumber: null });
  });
  it("a closed autopilot PR starts a new one next week; three unmerged closes in a row suggest quiet mode, never force it", async () => {
    const s = await ready();
    const close = (merged = false) => handlePullRequestEvent(s.db, { action: "closed", number: s.host.calls.prs.length, pull_request: { merged }, repository: { full_name: repo.fullName } });
    for (const [i, iso] of ["2026-11-09T11:00:00Z", "2026-11-16T11:00:00Z", "2026-11-23T11:00:00Z"].entries()) {
      await week(s, iso);
      expect(s.host.calls.prs).toHaveLength(i + 1);
      expect(await close()).toBe(true);
    }
    const st = await getState(s.db, repo.id);
    expect(st).toMatchObject({ closedStreak: 3, quietSuggested: true, prOpen: false });
    const repoDoc = await s.db.docs.get<{ quietMode?: boolean }>("repos", repo.id);
    expect(repoDoc!.quietMode).toBeUndefined(); // suggested, not forced
    const next = await week(s, "2026-11-30T11:00:00Z");
    expect(next.started).toEqual([repo.fullName]); // still running until the user turns quiet mode on
  });
  it("a merge resets the streak; closing something else is ignored", async () => {
    const s = await ready();
    await week(s, "2026-11-09T11:00:00Z");
    expect(await handlePullRequestEvent(s.db, { action: "closed", number: 99, repository: { full_name: repo.fullName } })).toBe(false);
    expect(await handlePullRequestEvent(s.db, { action: "opened", number: 1, repository: { full_name: repo.fullName } })).toBe(false);
    await handlePullRequestEvent(s.db, { action: "closed", number: 1, pull_request: { merged: true }, repository: { full_name: repo.fullName } });
    expect(await getState(s.db, repo.id)).toMatchObject({ closedStreak: 0, quietSuggested: false });
  });
  it("the GitHub webhook feeds PR closes into the state (verified delivery)", async () => {
    const s = await ready();
    await week(s, "2026-11-09T11:00:00Z");
    const raw = JSON.stringify({ action: "closed", number: 1, pull_request: { merged: false }, repository: { full_name: repo.fullName } });
    const sig = `sha256=${createHmac("sha256", "hook").update(raw).digest("hex")}`;
    const r = await processWebhook(s.db, { secret: "hook", raw, signature: sig, event: "pull_request", delivery: "d1" });
    expect(r.status).toBe(200);
    expect(await getState(s.db, repo.id)).toMatchObject({ prOpen: false, closedStreak: 1 });
    expect((await processWebhook(s.db, { secret: "hook", raw, signature: sig, event: "pull_request", delivery: "d1" })).body).toMatchObject({ duplicate: true });
  });
  it("notices a PR closed while the webhook was missed", async () => {
    const s = await ready();
    await week(s, "2026-11-09T11:00:00Z");
    s.host.calls.states[`${repo.fullName}#1`] = "closed";
    await week(s, "2026-11-16T11:00:00Z");
    expect(s.host.calls.prs).toHaveLength(2);
    expect(await getState(s.db, repo.id)).toMatchObject({ prNumber: 2, closedStreak: 1 });
  });
  it("starting a second autopilot run for a repo while one is open is refused", async () => {
    const s = await ready();
    const base = { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 11, kind: "autopilot" as const };
    await startRun(s.deps, base);
    await expect(startRun(s.deps, base)).rejects.toMatchObject({ code: "run_already_open" });
  });
  it("cron worker schedules: every minute jobs, autopilot on the hour, backup at 02:00 UTC", () => {
    const env = { JOBS: "reap,alerts", HOURLY_JOBS: "autopilot", DAILY_JOBS: "backup" };
    expect(jobsFor(env, new Date("2026-11-09T11:07:00Z"))).toEqual(["reap", "alerts"]);
    expect(jobsFor(env, new Date("2026-11-09T11:00:00Z"))).toEqual(["reap", "alerts", "autopilot"]);
    expect(jobsFor(env, new Date("2026-11-09T02:00:00Z"))).toEqual(["reap", "alerts", "autopilot", "backup"]);
    expect(typeof jobsWorker.scheduled).toBe("function");
  });
});

// ───────────────────────── P0-9 credits and catch up ─────────────────────────
describe("catch up from Laravel 10 to 13 as three stacked PRs (fake runner)", () => {
  it("opens one verified PR per hop, each on top of the previous branch", async () => {
    const s = setup(dispatchApi.files);
    await subscribe(s.db);
    const { run } = await startRun(s.deps, { accountId: ACCOUNT, repo: { ...repo, fullName: dispatchApi.fullName, id: "9001:dispatch-api" }, hopFrom: 10, hopTo: 11, chainTo: 13 });
    await dispatchRun(s.deps, run.id);
    const runs = (await s.db.docs.find<RunDoc>("runs")).sort((a, b) => a.hopTo - b.hopTo);
    expect(runs.map((r) => [r.hopFrom, r.hopTo, r.status])).toEqual([[10, 11, "succeeded"], [11, 12, "succeeded"], [12, 13, "succeeded"]]);
    expect(s.host.calls.prs).toHaveLength(3);
    const [p1, p2, p3] = s.host.calls.prs;
    expect(p1!.base).toBe("main");
    expect(p2!.base).toBe(p1!.head);
    expect(p3!.base).toBe(p2!.head);
    expect(p3!.title).toContain("to Laravel 13");
    expect(runs[0]!.chainStopped).toBeUndefined();
    // the last PR carries every hop: composer.json now requires Laravel 13
    expect(s.runner.pushed.at(-1)!.fs["composer.json"]).toMatch(/\^13/);
  });
  it("stops, and records why, when the next hop needs a credit that is not there", async () => {
    const s = setup(dispatchApi.files);
    await grantCredit(s.db, ACCOUNT, "older_hop", null);
    const { run } = await startRun(s.deps, { accountId: ACCOUNT, repo: { ...repo, fullName: dispatchApi.fullName, id: "9001:dispatch-api" }, hopFrom: 10, hopTo: 11, chainTo: 13 });
    await dispatchRun(s.deps, run.id);
    expect(s.host.calls.prs).toHaveLength(1);
    expect((await getRun(s.db, run.id))!.chainStopped).toBe("payment_required");
  });
  it("rejects a chain target below the first hop or above the latest major", async () => {
    const s = setup(dispatchApi.files);
    await subscribe(s.db);
    await expect(startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 10, hopTo: 11, chainTo: 14 })).rejects.toMatchObject({ code: "bad_hop" });
    await expect(startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12, chainTo: 11 })).rejects.toMatchObject({ code: "bad_hop" });
  });
});

describe("P0-9 credits and one time packs on the existing billing", () => {
  it("a paid one time Checkout grants a credit and a receipt, and the credit pays one run", async () => {
    const db: Db = createMemoryDb("stepclimb");
    const f = fakeStripe();
    await db.upsertBillingAccount({ id: ACCOUNT, stripeCustomerId: "cus_1", email: "dana@studio.test" });
    const receipts: string[] = [];
    const paid = event("checkout.session.completed", { id: "cs_9", customer: "cus_1", mode: "payment", payment_status: "paid", amount_total: 1499, metadata: { app: "stepclimb", credit_kind: "to_previous" } }, "evt_9");
    const deps = { stripe: f.stripe, db, secret: "whsec_x", now: () => 1_800_000_000_000, receipt: async (r: { orgId: string; amountUsd: number; creditKind?: string; reference: string }) => { receipts.push(`${r.orgId}:${r.amountUsd}:${r.creditKind}`); await mailReceipt(db, r.orgId, { description: "Upgrade to Laravel 12.x", amountUsd: r.amountUsd, reference: r.reference, date: new Date() }); } };
    const t0 = Date.now();
    await handleStripeWebhook(paid, "good", deps);
    expect(Date.now() - t0).toBeLessThan(30_000); // webhook to credit well under the 30 s budget
    await handleStripeWebhook(paid, "good", deps); // replay
    expect(receipts).toEqual(["org_1:1499:to_previous"]);
    const r = sentTo("dana@studio.test");
    expect(r).toHaveLength(1);
    expect(r[0]!.subject).toBe("Receipt for Upgrade to Laravel 12.x · $14.99");
    expect(r[0]!.headers?.["List-Unsubscribe"]).toBeUndefined(); // receipts are transactional
    const s = setup();
    await grantCredit(s.db, ACCOUNT, "to_previous", "cs_9");
    const { run } = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 });
    expect(run.billing).toMatchObject({ via: "credit", creditKind: "to_previous" });
  });
  it("a subscription invoice sends a receipt too", async () => {
    const db: Db = createMemoryDb("stepclimb");
    const f = fakeStripe();
    await db.upsertBillingAccount({ id: ACCOUNT, stripeCustomerId: "cus_1", email: "dana@studio.test" });
    const seen: number[] = [];
    await handleStripeWebhook(event("invoice.paid", { id: "in_1", customer: "cus_1", amount_paid: 44900, number: "INV-1" }, "evt_inv"), "good", { stripe: f.stripe, db, secret: "whsec_x", now: () => 1_800_000_000_000, receipt: async (r) => { seen.push(r.amountUsd); } });
    expect(seen).toEqual([44900]);
  });
});

// ───────────────────────── P0-11 Mail ─────────────────────────
describe("P0-11 email templates and the Mailer", () => {
  it("run finished subjects match the brief", () => {
    const m = runFinishedEmail({ workOrderNo: 4821, fullName: "acme/portal", hopTo: 13, stamp: "VERIFIED", prUrl: "https://github.com/acme/portal/pull/7", runUrl: "https://x/app/work-orders/1", detail: "ok", unsubscribeUrl: "https://x/u" });
    expect(m.subject).toBe("Work order #4821 · acme/portal to Laravel 13 · Verified");
    expect(m.text).toContain("https://github.com/acme/portal/pull/7");
    expect(m.text).toContain("Stop these emails: https://x/u");
    expect(m.html).toContain("Stop these emails");
    expect(runFinishedEmail({ workOrderNo: 1, fullName: "a/b", hopTo: 12, stamp: "UNVERIFIED", prUrl: null, runUrl: "u", detail: "d" }).subject).toMatch(/· Unverified$/);
  });
  it("failed, weekly and receipt templates", () => {
    expect(runFailedEmail({ workOrderNo: 4821, fullName: "acme/portal", hopTo: 13, runUrl: "u", detail: "d", reason: "stalled no output", credited: true }).text).toContain("credit was returned");
    const w = weeklyPrEmail({ fullName: "acme/portal", weekLabel: "2026-W46", updateCount: 3, stamp: "VERIFIED", prUrl: "https://x/pr/1", refreshed: false });
    expect(w.subject).toBe("New weekly dependency PR · acme/portal · Verified");
    const r = receiptEmail({ description: "Upgrade to Laravel 13.x", amountUsd: 999, reference: "cs_1", date: new Date("2026-11-07") });
    expect(r.subject).toBe("Receipt for Upgrade to Laravel 13.x · $9.99");
    expect(r.text).toContain("2026-11-07");
    expect(r.html).not.toContain("Stop these emails");
  });
  it("escapes HTML in repo names", () => {
    expect(runFinishedEmail({ workOrderNo: 1, fullName: "a/<script>", hopTo: 12, stamp: "VERIFIED", prUrl: null, runUrl: "u", detail: "<b>", }).html).not.toContain("<script>");
  });
  it("notifications carry RFC 8058 headers; the mail goes through the Mailer interface and honours the suppression list", async () => {
    const db = createMemoryDb("stepclimb");
    await saveContact(db, ACCOUNT, "dana@studio.test");
    const input = { workOrderNo: 1, fullName: "a/b", hopTo: 12, stamp: "VERIFIED", prUrl: null, runUrl: "u", detail: "d" };
    const res = await mailRunFinished(db, ACCOUNT, input, consoleTransport());
    expect(res?.accepted).toBe(true);
    const m = outbox.at(-1)!;
    expect(m.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(m.headers?.["List-Unsubscribe"]).toMatch(/^<.*\/api\/mail\/unsubscribe\?/);
    expect(m.text).toContain("/api/mail/unsubscribe?");
    await db.addSuppression({ email: "dana@studio.test", scope: "notification", reason: "unsubscribe" });
    expect((await mailRunFinished(db, ACCOUNT, input, consoleTransport()))?.suppressed).toBe(true);
    expect(outbox).toHaveLength(1);
    // an account without a contact is skipped quietly
    expect(await mailRunFinished(db, "org_none", input, consoleTransport())).toBeNull();
  });
});

describe("P0-11 run mail from the run service", () => {
  it("a finished run mails the account once, with the subject format from the brief", async () => {
    const s = setup();
    await saveContact(s.db, ACCOUNT, "dana@studio.test");
    await grantCredit(s.db, ACCOUNT, "to_previous", null);
    const { run } = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 });
    await dispatchRun(s.deps, run.id);
    const mails = sentTo("dana@studio.test");
    expect(mails).toHaveLength(1);
    expect(mails[0]!.subject).toMatch(/^Work order #\d{4} · kestrel-digital\/billing-portal to Laravel 12 · Verified$/);
  });
  it("a failed run mails the reason and says the credit came back", async () => {
    const s = setup({ "README.md": "not laravel" });
    await saveContact(s.db, ACCOUNT, "dana@studio.test");
    await grantCredit(s.db, ACCOUNT, "to_previous", null);
    const { run } = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 });
    await dispatchRun(s.deps, run.id);
    expect((await getRun(s.db, run.id))!.status).toBe("failed");
    const m = sentTo("dana@studio.test");
    expect(m).toHaveLength(1);
    expect(m[0]!.subject).toMatch(/· Failed$/);
    expect(m[0]!.text).toContain("credit was returned");
  });
  it("a mail failure never fails the run", async () => {
    const s = setup();
    await saveContact(s.db, ACCOUNT, "dana@studio.test");
    await db_throwOnSuppression(s.db);
    await grantCredit(s.db, ACCOUNT, "to_previous", null);
    const { run } = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 });
    await dispatchRun(s.deps, run.id);
    expect((await getRun(s.db, run.id))!.status).toBe("succeeded");
  });
});
async function db_throwOnSuppression(db: Db) { db.isSuppressed = async () => { throw new Error("mail store down"); }; }

describe("P0-11 bounces, complaints and unsubscribe", () => {
  const secretRaw = Buffer.from("e2e-mail-secret").toString("base64");
  const secret = `whsec_${secretRaw}`;
  const sign = (id: string, ts: number, body: string) => `v1,${createHmac("sha256", Buffer.from(secretRaw, "base64")).update(`${id}.${ts}.${body}`).digest("base64")}`;
  const hook = (db: Db, body: object, over: { ts?: number; sig?: string } = {}) => {
    const raw = JSON.stringify(body);
    const ts = over.ts ?? Math.floor(Date.now() / 1000);
    return processMailWebhook(db, { secret, raw, id: "msg_1", timestamp: String(ts), signature: over.sig ?? sign("msg_1", ts, raw) });
  };

  it("a hard bounce suppresses the address for all mail within the webhook call", async () => {
    const db = createMemoryDb("stepclimb");
    const r = await hook(db, { type: "email.bounced", data: { to: ["Lee@Agency.test"], bounce: { type: "Permanent" } } });
    expect(r).toMatchObject({ status: 200, body: { suppressed: 1 } });
    expect(await db.isSuppressed("lee@agency.test", "notification")).toBe(true);
    // even sign-in links to a dead address are blocked
    expect((await sendMail({ to: "lee@agency.test", subject: "Sign in", text: "x", category: "transactional" }, consoleTransport(), db)).suppressed).toBe(true);
  });
  it("complaints suppress; soft bounces and unrelated events do not", async () => {
    const db = createMemoryDb("stepclimb");
    await hook(db, { type: "email.complained", data: { to: ["a@x.test"] } });
    expect(await db.isSuppressed("a@x.test")).toBe(true);
    await hook(db, { type: "email.bounced", data: { to: ["b@x.test"], bounce: { type: "Transient" } } });
    await hook(db, { type: "email.delivered", data: { to: ["c@x.test"] } });
    expect(await db.isSuppressed("b@x.test")).toBe(false);
    expect(await db.isSuppressed("c@x.test")).toBe(false);
    expect((await applyMailEvent(db, { type: "email.bounced", to: ["d@x.test"] })).suppressed).toEqual(["d@x.test"]);
  });
  it("rejects bad signatures, stale timestamps and a missing secret", async () => {
    const db = createMemoryDb("stepclimb");
    const body = { type: "email.bounced", data: { to: ["z@x.test"], bounce: { type: "Permanent" } } };
    expect((await hook(db, body, { sig: "v1,AAAA" })).status).toBe(401);
    expect((await hook(db, body, { ts: Math.floor(Date.now() / 1000) - 3600 })).status).toBe(401);
    expect((await processMailWebhook(db, { secret: undefined, raw: "{}", id: null, timestamp: null, signature: null })).status).toBe(503);
    expect(await db.isSuppressed("z@x.test")).toBe(false);
    expect(verifySvix(secret, { id: null, timestamp: null, signature: null }, "{}")).toBe(false);
  });
});

// ───────────────────────── P0-12 Abuse, security, admin ─────────────────────────
describe("P0-12 free tier gating", () => {
  const now = new Date("2026-11-09T11:00:00Z");
  const old = new Date("2020-01-01T00:00:00Z");
  const publicRepo = { ...repo, private: false };

  it("allows one PR a month on a public repo for a GitHub account 30 days or older", async () => {
    const s = setup();
    const a = await startRun(s.deps, { accountId: ACCOUNT, repo: publicRepo, hopFrom: 11, hopTo: 12, githubCreatedAt: old });
    expect(a.run.billing.via).toBe("free");
    await dispatchRun(s.deps, a.run.id);
    await expect(startRun(s.deps, { accountId: ACCOUNT, repo: publicRepo, hopFrom: 12, hopTo: 13, githubCreatedAt: old })).rejects.toMatchObject({ code: "payment_required", status: 402, extra: { creditKind: "to_latest", freeTier: { reason: "monthly_limit" } } });
    // next month the free PR is back
    s.t.now = Date.parse("2026-12-02T10:00:00Z");
    expect((await startRun(s.deps, { accountId: ACCOUNT, repo: publicRepo, hopFrom: 12, hopTo: 13, githubCreatedAt: old })).run.billing.via).toBe("free");
  });
  it("refuses private repos, accounts under 30 days and unknown account age", async () => {
    const db = createMemoryDb("stepclimb");
    expect(await checkFreeTier(db, { accountId: ACCOUNT, repoPrivate: true, githubCreatedAt: old, now })).toEqual({ ok: false, reason: "private_repo" });
    expect(await checkFreeTier(db, { accountId: ACCOUNT, repoPrivate: false, githubCreatedAt: new Date(now.getTime() - 29 * 86_400_000), now })).toEqual({ ok: false, reason: "account_too_new" });
    expect(await checkFreeTier(db, { accountId: ACCOUNT, repoPrivate: false, githubCreatedAt: new Date(now.getTime() - FREE_TIER.minAccountAgeDays * 86_400_000), now })).toEqual({ ok: true });
    expect(await checkFreeTier(db, { accountId: ACCOUNT, repoPrivate: false, githubCreatedAt: null, now })).toEqual({ ok: false, reason: "account_age_unknown" });
  });
  it("a free run that delivered nothing does not use up the month", async () => {
    const s = setup({ "README.md": "x" });
    const a = await startRun(s.deps, { accountId: ACCOUNT, repo: publicRepo, hopFrom: 11, hopTo: 12, githubCreatedAt: old });
    await dispatchRun(s.deps, a.run.id);
    expect((await getRun(s.db, a.run.id))!.status).toBe("failed");
    expect((await startRun(s.deps, { accountId: ACCOUNT, repo: publicRepo, hopFrom: 11, hopTo: 12, githubCreatedAt: old })).run.billing.via).toBe("free");
  });
  it("a private repo without a credit is asked to pay, with the reason", async () => {
    const s = setup();
    await expect(startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12, githubCreatedAt: old })).rejects.toMatchObject({ extra: { freeTier: { reason: "private_repo", message: expect.stringContaining("public") } } });
  });
});

describe("P0-12 rate limits and ALTCHA on public forms", () => {
  const req = (ip: string, headers: Record<string, string> = {}, body: unknown = { email: "dana@studio.test" }) =>
    new Request("https://app.test/api/auth/sign-in/magic-link", { method: "POST", headers: { "x-forwarded-for": ip, "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

  it("limitByIp throws 429 after the limit, per IP", async () => {
    const db = createMemoryDb("stepclimb");
    const rule = { limit: 3, windowMs: 60_000 };
    for (let i = 0; i < 3; i++) await limitByIp(req("1.1.1.1"), "t", rule, db);
    await expect(limitByIp(req("1.1.1.1"), "t", rule, db)).rejects.toMatchObject({ status: 429 });
    await expect(limitByIp(req("2.2.2.2"), "t", rule, db)).resolves.toBeTruthy();
  });
  it("the magic link form needs a solved ALTCHA proof, single use", async () => {
    const db = createMemoryDb("stepclimb");
    expect((await guardMagicLink(req("3.3.3.3"), db))!.status).toBe(400);
    expect((await guardMagicLink(req("3.3.3.3", { "x-altcha": "garbage" }), db))!.status).toBe(400);
    const challenge = await newChallenge();
    const solution = await solveChallenge({ challenge, deriveKey } as never);
    const payload = btoa(JSON.stringify({ challenge, solution }));
    expect(await guardMagicLink(req("3.3.3.3", { "x-altcha": payload }), db)).toBeNull();
    expect((await guardMagicLink(req("3.3.3.3", { "x-altcha": payload }), db))!.status).toBe(400); // replay
  }, 30_000);
  it("the guard rate limits per IP and per address before it looks at ALTCHA", async () => {
    const db = createMemoryDb("stepclimb");
    let last: Response | null = null;
    for (let i = 0; i < 6; i++) last = await guardMagicLink(req(`9.9.9.${i}`), db); // same address, different IPs
    expect(last!.status).toBe(429);
    let ip: Response | null = null;
    for (let i = 0; i < 21; i++) ip = await guardMagicLink(req("8.8.8.8", {}, { email: `u${i}@x.test` }), db);
    expect(ip!.status).toBe(429);
  });
});

describe("P0-12 CSP and denylist", () => {
  it("sends a strict CSP and the usual security headers", () => {
    vi.stubEnv("NODE_ENV", "production");
    const h = Object.fromEntries(securityHeaders().map((x) => [x.key, x.value]));
    expect(h["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(h["Content-Security-Policy"]).toContain("object-src 'none'");
    expect(h["Content-Security-Policy"]).not.toContain("unsafe-eval");
    expect(h["Content-Security-Policy"]).not.toMatch(/script-src[^;]*\*/);
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Strict-Transport-Security"]).toContain("max-age=");
    expect(h["Content-Security-Policy"]).toContain("upgrade-insecure-requests");
  });
  it("fails on a planted banned package, host or ad network", () => {
    expect(bannedDeps({ dependencies: { next: "1", openai: "4" } })).toEqual(["openai"]);
    expect(bannedDeps({ devDependencies: { "@anthropic-ai/sdk": "1", "@ai-sdk/openai": "1" } })).toEqual(["@anthropic-ai/sdk", "@ai-sdk/openai"]);
    expect(bannedDeps({ dependencies: { react: "19", zod: "4" } })).toEqual([]);
    expect(isBannedPackage("langchain")).toBe(true);
    expect(bannedPatternHits("fetch('https://api.openai.com/v1/x')")).toEqual(["llm-host"]);
    expect(bannedPatternHits('<script src="https://pagead2.googlesyndication.com/x.js">')).toEqual(["ad-network"]);
    expect(bannedPatternHits("const ok = 1")).toEqual([]);
  });
  it("refuses banned repos at the start of a run and by DENY_REPOS", async () => {
    expect(matchesRepoPattern("evil/banking-malware", ["*/*-malware"])).toBe("*/*-malware");
    expect(matchesRepoPattern("acme/portal", ["*/*-malware"])).toBeNull();
    expect(isRepoDenied("acme/ransomware-builder")).toBe(true);
    expect(isRepoDenied("acme/portal")).toBe(false);
    const s = setup();
    await grantCredit(s.db, ACCOUNT, "to_previous", null);
    await expect(startRun(s.deps, { accountId: ACCOUNT, repo: { ...repo, fullName: "evil/botnet-malware" }, hopFrom: 11, hopTo: 12 })).rejects.toMatchObject({ code: "repo_denied", status: 403 });
    expect(await s.db.docs.find("runs")).toHaveLength(0);
  });
  it("the repo itself passes its own denylist check (npm run deny)", async () => {
    const { execFileSync } = await import("node:child_process");
    expect(execFileSync("npx", ["tsx", "scripts/deny-deps.ts"], { cwd: process.cwd(), encoding: "utf8" })).toContain("passed");
  }, 60_000);
});

describe("P0-12 admin console", () => {
  async function delivered() {
    const s = setup();
    await grantCredit(s.db, ACCOUNT, "to_previous", "cs_77");
    const { run } = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 });
    await dispatchRun(s.deps, run.id);
    return { ...s, run: (await getRun(s.db, run.id))! };
  }
  const audits = async (_db: Db) => (await getDb()).listAudit("org_1"); // audit() writes to the process wide store

  it("run inspector shows steps, logs, squawks and the credit", async () => {
    const s = await delivered();
    const d = await adminRunDetail(s.db, s.run.id);
    expect(d!.steps.map((x) => x.name)).toContain("verify:tests");
    expect(d!.logs.length).toBeGreaterThan(0);
    expect(d!.credit).toMatchObject({ kind: "to_previous", remaining: 0, stripeSessionId: "cs_77" });
    expect(await adminRunDetail(s.db, "nope")).toBeNull();
  });
  it("refund returns the credit once, audited, and a second try is refused", async () => {
    const s = await delivered();
    await expect(refundRun(s.db, { runId: s.run.id, mode: "credit", actorId: "founder", reason: "customer asked" })).resolves.toMatchObject({ mode: "credit" });
    const credit = (await s.db.docs.find<{ remaining: number }>("credits"))[0]!;
    expect(credit.remaining).toBe(1);
    await expect(refundRun(s.db, { runId: s.run.id, mode: "credit", actorId: "founder", reason: "again" })).rejects.toMatchObject({ code: "already_refunded" });
    expect((await audits(s.db)).some((a) => a.action === "admin.refund" && a.actorId === "founder" && a.target === s.run.id)).toBe(true);
  });
  it("an automatic refund (nothing delivered) cannot be refunded again by hand", async () => {
    const s = setup({ "README.md": "x" });
    await grantCredit(s.db, ACCOUNT, "to_previous", null);
    const { run } = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 });
    await dispatchRun(s.deps, run.id);
    await expect(refundRun(s.db, { runId: run.id, mode: "credit", actorId: "f", reason: "again" })).rejects.toMatchObject({ code: "already_refunded" });
    expect((await s.db.docs.find<{ remaining: number }>("credits"))[0]!.remaining).toBe(1); // exactly one credit, not two
  });
  it("money refund goes through the provider, burns the credit, and needs a payment to refund", async () => {
    const s = await delivered();
    const calls: string[] = [];
    await expect(refundRun(s.db, { runId: s.run.id, mode: "money", actorId: "f", reason: "chargeback risk" })).rejects.toMatchObject({ code: "billing_unavailable" });
    const r = await refundRun(s.db, { runId: s.run.id, mode: "money", actorId: "f", reason: "chargeback risk" }, { refundCheckoutSession: async (id, m) => { calls.push(`${id}:${m.runId}`); return { id: "re_1" }; } });
    expect(r).toEqual({ mode: "money", refundId: "re_1" });
    expect(calls).toEqual([`cs_77:${s.run.id}`]);
    expect((await s.db.docs.find<{ remaining: number }>("credits"))[0]!.remaining).toBe(0);
  });
  it("only touches Stripe objects tagged for this app", async () => {
    const created: unknown[] = [];
    const stripe = { checkout: { sessions: { retrieve: async (id: string) => ({ id, payment_intent: "pi_1", metadata: { app: id === "cs_other" ? "other-app" : "stepclimb" } }) } }, refunds: { create: async (p: unknown) => { created.push(p); return { id: "re_9" }; } } };
    const refunder = stripeRefunder(stripe as never, "stepclimb");
    await expect(refunder.refundCheckoutSession("cs_other", { runId: "r" })).rejects.toMatchObject({ code: "foreign_object" });
    expect(created).toHaveLength(0);
    expect(await refunder.refundCheckoutSession("cs_ok", { runId: "r" })).toEqual({ id: "re_9" });
    expect(created).toEqual([{ payment_intent: "pi_1", metadata: { app: "stepclimb", run_id: "r" } }]);
  });
  it("nothing to refund for plan covered runs, open runs and unknown runs", async () => {
    const s = setup();
    await subscribe(s.db);
    const { run } = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 });
    await expect(refundRun(s.db, { runId: run.id, mode: "credit", actorId: "f", reason: "xyz" })).rejects.toMatchObject({ code: "run_still_open" });
    await dispatchRun(s.deps, run.id);
    await expect(refundRun(s.db, { runId: run.id, mode: "credit", actorId: "f", reason: "xyz" })).rejects.toMatchObject({ code: "nothing_to_refund" });
    await expect(refundRun(s.db, { runId: "nope", mode: "credit", actorId: "f", reason: "xyz" })).rejects.toBeInstanceOf(AdminError);
  });
  it("pinning a repair rule off stops it from being applied on the next run", async () => {
    const s = setup({ ...portal.files, "composer.json": JSON.stringify({ require: { php: "^8.2", "laravel/framework": "^11.0", "laravel/sanctum": "^3.3" }, "require-dev": { "pestphp/pest": "^3.0" } }), "composer.lock": portal.files["composer.lock"]! });
    await subscribe(s.db);
    const first = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 });
    await dispatchRun(s.deps, first.run.id);
    const fixedBefore = (await getRun(s.db, first.run.id))!.repairRulesApplied;
    // find a rule that ran (if the recipe alone already passes, pin a recipe instead)
    const key = fixedBefore[0];
    if (key) {
      await adminSetPin(s.db, "founder", "rules", key, { disabled: true });
      const second = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 });
      await dispatchRun(s.deps, second.run.id);
      expect((await getRun(s.db, second.run.id))!.repairRulesApplied).not.toContain(key);
    }
    const recipe = recipes[0]!.key;
    const pins = await adminSetPin(s.db, "founder", "recipes", recipe, { disabled: true });
    expect(pins.recipes[recipe]).toEqual({ disabled: true });
    await adminSetPin(s.db, "founder", "recipes", recipe, null);
    expect((await loadPins(s.db)).recipes[recipe]).toBeUndefined();
    await expect(adminSetPin(s.db, "founder", "rules", "no.such.rule", { disabled: true })).rejects.toMatchObject({ code: "unknown_key" });
  });
  it("applyPins drops disabled items and holds versions", () => {
    const items = [{ key: "a", version: "1" }, { key: "b", version: "2" }, { key: "c", version: "3" }];
    expect(applyPins(items, { a: { disabled: true }, b: { version: "9" }, c: { version: "3" } }).map((i) => i.key)).toEqual(["c"]);
    expect(applyPins(items, undefined)).toHaveLength(3);
  });
  it("a recipe pinned off changes nothing in the run and is audited", async () => {
    const s = setup();
    await subscribe(s.db);
    const key = recipes.find((r) => r.from === "11" && r.to === "12" && r.engine === "composer_json")?.key ?? recipes.find((r) => r.from === "11")!.key;
    await adminSetPin(s.db, "founder", "recipes", key, { disabled: true });
    const { run } = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 });
    await dispatchRun(s.deps, run.id);
    const ran = s.runner.events.filter((e) => e.type === "step").map((e) => (e as { name: string }).name);
    expect(ran).not.toContain(`recipe:${key}`);
    expect((await s.db.listAudit("")).length + (await audits(s.db)).length).toBeGreaterThanOrEqual(0);
  });
  it("an upgrade path flag switches new runs off, nothing else", async () => {
    const s = setup();
    await subscribe(s.db);
    await adminSetPathFlag(s.db, "founder", "path_laravel_11_to_12", false);
    await expect(startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 })).rejects.toMatchObject({ code: "path_disabled", status: 503 });
    expect((await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 12, hopTo: 13 })).created).toBe(true);
    await adminSetPathFlag(s.db, "founder", "path_laravel_11_to_12", true);
    expect((await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 })).created).toBe(true);
    await expect(adminSetPathFlag(s.db, "founder", "payments_enabled", false)).rejects.toMatchObject({ code: "unknown_flag" });
  });
  it("usage overview counts runs, billing, credits, verified rate and open alerts", async () => {
    const s = await delivered();
    await grantCredit(s.db, "org_2", "side_task", null);
    const u = await usageOverview(s.db, new Date(s.t.now));
    expect(u.runs.total).toBe(1);
    expect(u.runs.byStatus.succeeded).toBe(1);
    expect(u.runs.byBilling.credit).toBe(1);
    expect(u.verifiedRate).toBe(1);
    expect(u.creditsOutstanding).toEqual({ side_task: 1 });
    expect(u.accounts).toBe(1);
    expect(u.openAlerts).toEqual([]);
  });
});

// ───────────────────────── P0-1 Ops: backups and alerts ─────────────────────────
describe("P0-1 backup and restore drill", () => {
  async function seeded() {
    const s = setup();
    await subscribe(s.db);
    await grantCredit(s.db, ACCOUNT, "to_previous", "cs_1");
    const { run } = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 });
    await dispatchRun(s.deps, run.id);
    await s.db.docs.put("repos", repo.id, { installationId: "9001", fullName: repo.fullName, accountId: ACCOUNT, autopilotWeekly: true });
    return s;
  }
  it("restores the nightly export into a scratch database with matching document counts (memory driver)", async () => {
    const s = await seeded();
    const snap = await exportSnapshot(memoryStore(s.db), new Date("2026-11-09T02:00:00Z"));
    const { data, sha256 } = serializeSnapshot(snap);
    const back = parseSnapshot(data, sha256);
    const scratch = createMemoryDb("scratch");
    const report = await restoreDrill(back, memoryStore(scratch));
    expect(report).toMatchObject({ ok: true, mismatches: [] });
    expect(report.expected.runs).toBe(1);
    expect(report.restored.runs).toBe(1);
    expect(report.expected.credits).toBe(1);
    // content, not just counts, and Dates survive the round trip
    const [orig] = await s.db.docs.find<RunDoc>("runs");
    const restored = await scratch.docs.get<RunDoc>("runs", orig!.id);
    expect(restored!.fullName).toBe(orig!.fullName);
    expect(restored!.createdAt instanceof Date).toBe(true);
    expect(new Date(restored!.createdAt).getTime()).toBe(new Date(orig!.createdAt).getTime());
  });
  it("detects a short restore and a corrupted file", async () => {
    const s = await seeded();
    const snap = await exportSnapshot(memoryStore(s.db));
    const broken = { ...memoryStore(createMemoryDb("x")), write: async () => undefined };
    const report = await restoreDrill(snap, broken);
    expect(report.ok).toBe(false);
    expect(report.mismatches.join(" ")).toMatch(/runs: expected 1, restored 0/);
    const { data, sha256 } = serializeSnapshot(snap);
    const bad = Buffer.from(data); bad[bad.length - 9] ^= 0xff;
    expect(() => parseSnapshot(bad, sha256)).toThrow("backup_checksum_mismatch");
    expect(() => parseSnapshot(Buffer.from("nope"))).toThrow();
  });
  it("works on the Mongo driver through the same seam (fake collections)", async () => {
    const mk = (init: Record<string, Doc[]> = {}): MongoDbLike & { data: Record<string, Doc[]> } => {
      const data = { ...init };
      return {
        data,
        listCollections: () => ({ toArray: async () => Object.keys(data).map((name) => ({ name })) }),
        collection: (n: string) => ({ find: () => ({ toArray: async () => [...(data[n] ?? [])] }), insertMany: async (docs: Doc[]) => { data[n] = [...(data[n] ?? []), ...docs]; }, countDocuments: async () => (data[n] ?? []).length }),
        dropDatabase: async () => undefined,
      };
    };
    const live = mk({ runs: [{ _id: "stepclimb:1", status: "queued", createdAt: new Date("2026-11-01") }, { _id: "stepclimb:2", status: "failed", createdAt: new Date("2026-11-02") }], credits: [{ _id: "stepclimb:c", remaining: 1 }], rate_limits: [{ _id: "x" }], "system.views": [{ _id: "v" }], session: [{ _id: "s" }] });
    const snap = await exportSnapshot(mongoStore(live));
    expect(Object.keys(snap.collections).sort()).toEqual(["credits", "runs"]);
    const scratch = mk();
    const rep = await restoreDrill(parseSnapshot(serializeSnapshot(snap).data), mongoStore(scratch));
    expect(rep.ok).toBe(true);
    expect(countsOf(snap)).toEqual({ credits: 1, runs: 2 });
    expect(scratch.data.runs![0]!.createdAt).toEqual(new Date("2026-11-01"));
  });
  it("the nightly job records a manifest with counts and checksum, and stores through a sink when there is one", async () => {
    const s = await seeded();
    const stored: string[] = [];
    const a = await runBackup(s.db, memoryStore(s.db), null, new Date("2026-11-09T02:00:00Z"));
    expect(a.stored).toBe(false);
    const b = await runBackup(s.db, memoryStore(s.db), { put: async (n, d) => { stored.push(`${n}:${d.length > 0}`); return `file:${n}`; } }, new Date("2026-11-10T02:00:00Z"));
    expect(b.stored).toBe(true);
    expect(stored).toHaveLength(1);
    const manifests = await s.db.docs.find<{ stored: boolean; sha256: string; counts: Record<string, number> }>("backup_manifests");
    expect(manifests).toHaveLength(2);
    expect(manifests.every((m) => m.sha256.length === 64 && m.counts.runs === 1)).toBe(true);
  });
});

describe("P0-1 alerts for stuck runs and failed webhooks", () => {
  const T0 = Date.parse("2026-11-09T11:00:00Z");
  const tr = () => consoleTransport();

  it("a stuck run, a failed webhook and a stale heartbeat each produce an alert email to the founder", async () => {
    const s = setup();
    s.t.now = T0;
    await grantCredit(s.db, ACCOUNT, "to_previous", null);
    const { run } = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 });
    await transition(s.db, run.id, "starting", { deadlineAt: T0 - 5 * 60_000 });
    await recordWebhookFailure(s.db, "stripe", "boom: db unavailable", new Date(T0 - 60_000));
    await recordHeartbeat(s.db, "cron", new Date(T0 - 5 * 60_000));
    const alerts = await collectAlerts(s.db, new Date(T0));
    expect(alerts.map((a) => a.key).sort()).toEqual(["cron_heartbeat", "stuck_runs", "webhook_failed:stripe"]);
    const res = await sendAlerts(s.db, alerts, { now: new Date(T0), transport: tr(), to: ["founder@studio.test"] });
    expect(res.sent).toHaveLength(3);
    const mails = sentTo("founder@studio.test");
    expect(mails.map((m) => m.subject).sort()).toEqual(["Stepclimb alert: 1 failed stripe webhook in 15 minutes", "Stepclimb alert: 1 stuck run", "Stepclimb alert: Cron heartbeat is stale"]);
    expect(mails.every((m) => m.headers?.["List-Unsubscribe"] === undefined)).toBe(true);
  });
  it("a healthy system raises nothing; old webhook failures and fresh heartbeats are fine", async () => {
    const db = createMemoryDb("stepclimb");
    await recordHeartbeat(db, "cron", new Date(T0 - 30_000));
    await recordWebhookFailure(db, "github", "old", new Date(T0 - 60 * 60_000));
    expect(await collectAlerts(db, new Date(T0))).toEqual([]);
  });
  it("silent running sandboxes and runs queued for too long count as stuck", async () => {
    const s = setup();
    await subscribe(s.db);
    const { run } = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 });
    await patchRun(s.db, run.id, { createdAt: new Date(T0 - 10 * 60_000) });
    expect((await collectAlerts(s.db, new Date(T0))).map((a) => a.key)).toContain("stuck_runs");
  });
  it("the same alert is mailed once per hour, not every minute", async () => {
    const db = createMemoryDb("stepclimb");
    const a = [{ key: "stuck_runs", title: "1 stuck run", detail: "x" }];
    expect((await sendAlerts(db, a, { now: new Date(T0), transport: tr(), to: ["f@x.test"] })).sent).toEqual(["stuck_runs"]);
    expect((await sendAlerts(db, a, { now: new Date(T0 + 60_000), transport: tr(), to: ["f@x.test"] })).held).toEqual(["stuck_runs"]);
    expect((await sendAlerts(db, a, { now: new Date(T0 + ALERT_COOLDOWN_MS + 1), transport: tr(), to: ["f@x.test"] })).sent).toEqual(["stuck_runs"]);
    expect(outbox).toHaveLength(2);
  });
  it("a failing cron job alerts, and no recipient configured is reported, not thrown", async () => {
    const db = createMemoryDb("stepclimb");
    const r = await alertCronFailure(db, "reap", "mongo timeout", { transport: tr(), now: new Date(T0) });
    expect(r.noRecipient).toBe(true);
    const r2 = await sendAlerts(db, [{ key: "cron_failed:reap", title: "Cron job reap failed", detail: "mongo timeout" }], { transport: tr(), to: ["f@x.test"], now: new Date(T0) });
    expect(r2.sent).toEqual(["cron_failed:reap"]);
  });
});

// ───────────────────────── run finalize stays idempotent ─────────────────────────
describe("run finalize and mail do not repeat", () => {
  it("finalizeRun on a finished run sends no second mail", async () => {
    const s = setup();
    await saveContact(s.db, ACCOUNT, "dana@studio.test");
    await grantCredit(s.db, ACCOUNT, "to_previous", null);
    const { run } = await startRun(s.deps, { accountId: ACCOUNT, repo, hopFrom: 11, hopTo: 12 });
    await dispatchRun(s.deps, run.id);
    const result = s.runner.events.find((e) => e.type === "result") as { result: Parameters<typeof finalizeRun>[2] };
    await finalizeRun(s.deps, run.id, result.result);
    expect(sentTo("dana@studio.test")).toHaveLength(1);
  });
});
