import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryDb } from "@/lib/db/memory";
import type { Db } from "@/lib/db/types";
import { csvCell, hangarCsv } from "@/lib/github/hangar-csv";
import type { HangarRow } from "@/lib/github/hangar";
import { latestScans } from "@/lib/github/scan";
import { grantCredit, consumeCredit, refundCredit, availableCredit } from "@/lib/runs/store";
import { guardInvite } from "@/lib/security/magic-link-guard";
import { webhookFlood } from "@/lib/security/ratelimit";
import { scanText } from "../../scripts/scan-bundle";
import { handleStripeWebhook } from "@/lib/billing/webhook";
import { event, fakeStripe } from "./fakes";

let db: Db;
beforeEach(() => { db = createMemoryDb("stepclimb"); });
const post = (url: string, body: unknown, ip = "9.9.9.9") => new Request(url, { method: "POST", headers: { "x-forwarded-for": ip, "content-type": "application/json" }, body: JSON.stringify(body) });

describe("Hangar CSV export", () => {
  const row = (o: Partial<HangarRow>): HangarRow => ({ key: "k", repoId: "r", repo: "acme/app", path: "", scanId: "s", kind: "laravel", stack: "Livewire", version: "11.45.0", major: 11, behind: 2, eol: { state: "ended", days: -10, securityEnd: "2026-03-12" }, tests: "pest", effort: "M", supported: true, lastRun: null, ...o });
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(csvCell(null)).toBe("");
  });
  it("defuses spreadsheet formulas but keeps plain negative numbers", () => {
    for (const evil of ["=HYPERLINK(\"http://x\")", "+1+1", "@SUM(A1)", "-2+3", "\tx"]) expect(csvCell(evil).replace(/^"/, "")[0]).toBe("'");
    expect(csvCell(-3)).toBe("-3");
  });
  it("has a header, one line per airframe and unicode intact", () => {
    const out = hangarCsv([row({ repo: "acme/ünï-app" }), row({ kind: "unscanned", version: null, eol: null, tests: null, stack: "", effort: null, behind: 0 })]);
    const lines = out.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^repository,app_path,status/);
    expect(lines[1]).toContain("acme/ünï-app,,laravel,11.45.0,2,2026-03-12,ended,Pest,Livewire,M");
    expect(lines[2]).toContain("not_scanned");
  });
});

describe("list screens do not query per row", () => {
  it("latestScans returns the newest scan of each repo in one pass", async () => {
    for (const [id, repoId, createdAt] of [["s1", "r1", 1], ["s2", "r1", 3], ["s3", "r2", 2]] as const) await db.docs.insert("scans", id, { repoId, createdAt: new Date(createdAt) });
    const m = await latestScans(db, ["r1", "r2", "r3"]);
    expect(m.get("r1")?.id).toBe("s2");
    expect(m.get("r2")?.id).toBe("s3");
    expect(m.has("r3")).toBe(false);
    expect((await latestScans(db, [])).size).toBe(0);
  });
});

describe("credit give back is once per spend (P2-3)", () => {
  it("refunding the same spend twice returns one credit", async () => {
    await grantCredit(db, "a", "to_latest", "cs_1");
    const id = (await consumeCredit(db, "a", "to_latest"))!;
    expect(await availableCredit(db, "a", "to_latest")).toBeNull();
    await refundCredit(db, id);
    await refundCredit(db, id);
    expect((await db.docs.get<{ remaining: number }>("credits", id))!.remaining).toBe(1);
    expect(await consumeCredit(db, "a", "to_latest")).toBe(id); // spendable again
    await refundCredit(db, id); // a new spend can be given back once more
    expect((await db.docs.get<{ remaining: number }>("credits", id))!.remaining).toBe(1);
  });
});

describe("abuse controls", () => {
  it("invitations: 3 per address per hour, 30 per IP per hour", async () => {
    for (let i = 0; i < 3; i++) expect(await guardInvite(post("https://a.test/api/auth/organization/invite-member", { email: "Victim@x.test" }, `1.1.1.${i}`), db)).toBeNull();
    const blocked = await guardInvite(post("https://a.test/api/auth/organization/invite-member", { email: "victim@x.test" }, "1.1.1.9"), db);
    expect(blocked?.status).toBe(429);
    for (let i = 0; i < 30; i++) await guardInvite(post("https://a.test/x", { email: `u${i}@x.test` }, "2.2.2.2"), db);
    expect((await guardInvite(post("https://a.test/x", { email: "late@x.test" }, "2.2.2.2"), db))?.status).toBe(429);
  });
  it("signed webhooks: a flood from one IP is refused, a normal rate is not", async () => {
    const req = () => post("https://a.test/api/stripe/webhook", {}, "3.3.3.3");
    for (let i = 0; i < 300; i++) expect(await webhookFlood(req(), db)).toBe(false);
    expect(await webhookFlood(req(), db)).toBe(true);
    expect(await webhookFlood(post("https://a.test/w", {}, "4.4.4.4"), db)).toBe(false);
  });
});

describe("Stripe webhook edge cases", () => {
  it("a bad signature is refused and records nothing", async () => {
    const f = fakeStripe();
    const body = event("customer.subscription.updated", { id: "sub_x", customer: "cus_x" }, "evt_bad");
    const r = await handleStripeWebhook(body, "forged", { stripe: f.stripe, db, secret: "whsec_x", now: () => 1_800_000_000_000 });
    expect(r.status).toBe(400);
    expect(await db.docs.get("stripe_events", "evt_bad")).toBeNull();
  });
});

describe("secrets never reach the browser bundle", () => {
  it("detects key shapes and live env values, ignores clean code", () => {
    expect(scanText("var k='" + "sk_live_" + "a".repeat(24) + "'", {})).toContain("stripe secret key");
    expect(scanText("x", {})).toEqual([]);
    expect(scanText("hello super-secret-value-12345 world", { STRIPE_WEBHOOK_SECRET: "super-secret-value-12345" })).toEqual(["value of STRIPE_WEBHOOK_SECRET"]);
    expect(scanText("short", { SOME_TOKEN: "short" })).toEqual([]);
  });
});
