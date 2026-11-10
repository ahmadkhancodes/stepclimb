import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryDb } from "@/lib/db/memory";
import type { Db } from "@/lib/db/types";
import { createCheckoutSession } from "@/lib/billing/checkout";
import { handleStripeWebhook } from "@/lib/billing/webhook";
import { clearPriceCache } from "@/lib/billing/catalog";
import { grantCredit, consumeCredit, availableCredit } from "@/lib/runs/store";
import { checkFreeTier } from "@/lib/runs/free-tier";
import { createRun } from "@/lib/runs/store";
import { sendMailSafe } from "@/lib/mail";
import { sendAlerts } from "@/lib/ops/alerts";
import { event, fakeStripe } from "./fakes";

const NOW = 1_800_000_000_000;
let db: Db;
let f: ReturnType<typeof fakeStripe>;
let cus: string;
beforeEach(async () => {
  db = createMemoryDb("stepclimb");
  f = fakeStripe();
  clearPriceCache();
  await createCheckoutSession(f.stripe, db, { orgId: "org_1", email: "d@x.test", userId: "u" }, "agency", "month", { success: "https://a.test/s", cancel: "https://a.test/c" });
  cus = (await db.getBillingAccount("org_1"))!.stripeCustomerId!;
});
const hook = (body: string) => handleStripeWebhook(body, "good", { stripe: f.stripe, db, secret: "whsec_x", now: () => NOW });
const session = (o: Record<string, unknown> = {}) => ({ id: "cs_credit1", customer: cus, mode: "payment", payment_status: "paid", payment_intent: "pi_credit1", metadata: { app: "stepclimb", credit_kind: "to_latest" }, amount_total: 4900, ...o });

describe("P1-11 refund of a credit purchase takes the unspent credit back", () => {
  it("revokes the credit and leaves the subscription alone", async () => {
    f.addSub(cus, "stepclimb_agency_monthly");
    await hook(event("checkout.session.completed", session()));
    expect(await availableCredit(db, "org_1", "to_latest", new Date(NOW))).not.toBeNull();
    await hook(event("charge.refunded", { customer: cus, refunded: true, payment_intent: "pi_credit1" }));
    expect(await availableCredit(db, "org_1", "to_latest", new Date(NOW))).toBeNull();
    expect(f.calls.some((c) => c.method === "subscriptions.cancel")).toBe(false);
  });
  it("a refund that arrives before the checkout event stops the later grant; duplicates are harmless", async () => {
    await hook(event("charge.refunded", { customer: cus, refunded: true, payment_intent: "pi_credit1" }));
    const body = event("checkout.session.completed", session());
    await hook(body);
    await hook(body);
    expect(await availableCredit(db, "org_1", "to_latest", new Date(NOW))).toBeNull();
  });
  it("a spent credit is not clawed back and a duplicate session still grants once", async () => {
    await hook(event("checkout.session.completed", session()));
    await hook(event("checkout.session.completed", session(), "evt_other"));
    expect(await consumeCredit(db, "org_1", "to_latest", new Date(NOW))).not.toBeNull();
    expect(await consumeCredit(db, "org_1", "to_latest", new Date(NOW))).toBeNull();
    const r = await hook(event("charge.refunded", { customer: cus, refunded: true, payment_intent: "pi_credit1" }));
    expect(r.status).toBe(200);
  });
  it("async payment success grants; unknown events answer 200", async () => {
    await hook(event("checkout.session.async_payment_succeeded", session({ id: "cs_async" })));
    expect(await availableCredit(db, "org_1", "to_latest", new Date(NOW))).not.toBeNull();
    const r = await hook(event("some.future_event", { customer: cus }));
    expect(r.status).toBe(200);
  });
  it("a credit grant without a payment intent still works (older events)", async () => {
    expect(await grantCredit(db, "org_1", "to_latest", "cs_x", new Date(NOW))).toBe(true);
  });
});

describe("P1-12 free PR is also limited per GitHub owner", () => {
  const now = new Date("2026-11-09T11:00:00Z");
  const old = new Date("2020-01-01T00:00:00Z");
  const mk = (accountId: string, fullName: string) =>
    createRun(db, { accountId, repoId: "r", installationId: "i", fullName, baseBranch: "main", hopFrom: 11, hopTo: 12, billing: { via: "free", creditId: null, creditKind: null }, now });
  it("a new account for the same owner gets no second free PR this month", async () => {
    await mk("org_old", "Acme/site");
    expect(await checkFreeTier(db, { accountId: "org_new", ownerLogin: "acme", repoPrivate: false, githubCreatedAt: old, now })).toEqual({ ok: false, reason: "monthly_limit" });
    expect(await checkFreeTier(db, { accountId: "org_new", ownerLogin: "other", repoPrivate: false, githubCreatedAt: old, now })).toEqual({ ok: true });
  });
});

describe("mail provider rejection never fails a request", () => {
  const bad = { name: "resend", send: async () => { throw new Error("mail_send_failed_422 secret provider text"); } };
  it("sendMailSafe swallows and returns null", async () => {
    expect(await sendMailSafe({ to: "nobody@bad", subject: "s", text: "t", html: "h" }, "test", bad, db)).toBeNull();
  });
  it("founder alerts survive a rejected address", async () => {
    const r = await sendAlerts(db, [{ key: "k", title: "t", detail: "d" }], { transport: bad, to: ["a@x.test"], now: new Date(NOW) });
    expect(r.sent).toEqual(["k"]);
  });
});
