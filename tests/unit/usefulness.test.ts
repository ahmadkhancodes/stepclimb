import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { INTERVAL_COPY, MAX_SEATS, oneOffs, planById, planForLookupKey, product, type Interval, type PlanId } from "@/config/product";
import { clearPriceCache } from "@/lib/billing/catalog";
import { checkoutReturnUrls, createCheckoutSession, createPortalSession } from "@/lib/billing/checkout";
import { effectivePlan, limitFor } from "@/lib/billing/entitlement";
import { handleStripeWebhook } from "@/lib/billing/webhook";
import { createMemoryDb } from "@/lib/db/memory";
import type { Db } from "@/lib/db/types";
import { RULES } from "@/lib/security/ratelimit";
import { signPayload } from "@/lib/webhooks/outbound";
import { meterText } from "@/components/app/meter";
import { seatsState } from "@/app/app/settings/members/members-client";
import { docs as docPages } from "@/content/docs";
import { meCurl } from "@/content/docs/snippets";
import { event, fakeStripe } from "./fakes";

const NOW = 1_800_000_000_000;
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const doc = (slug: string) => docPages.find((d) => d.slug === slug)!;

describe("friction fixes", () => {
  it("6 month prices read 'every 6 months', never 'per half' or 'billed monthly'", () => {
    expect(INTERVAL_COPY.half).toEqual({ per: "every 6 months", billed: "billed every 6 months" });
    const src = read("src/app/app/billing/billing-client.tsx");
    expect(src).not.toMatch(/per \$\{price\.interval\}/);
    expect(src).not.toMatch(/"yearly" : "monthly"/);
  });

  it("a meter the plan does not include says so instead of '0 of 0'", () => {
    expect(meterText({ meter: "repos", used: 0, limit: 0 })).toBe("Not on this plan");
    expect(meterText({ meter: "seats", used: 1, limit: 5 })).toBe("1 of 5");
    expect(meterText({ meter: "public_prs", used: 0, limit: 1 })).toBe("0 of 1 this month");
  });

  it("members plus pending invitations fill the seats", () => {
    expect(seatsState(1, 0, 1)).toEqual({ taken: 1, full: true, left: 0 });
    expect(seatsState(2, 1, 5)).toEqual({ taken: 3, full: false, left: 2 });
  });

  it("the API keys page and the docs use one curl snippet", () => {
    expect(meCurl("https://x.test/", "stea_abc")).toBe('curl https://x.test/api/v1/me \\\n  -H "x-api-key: stea_abc"');
    const auth = doc("authentication").sections.find((s) => s.code)!;
    expect(auth.code!.code).toBe(meCurl(product.url));
    expect(read("src/app/app/settings/api-keys/api-keys-client.tsx")).toContain("meCurl(window.location.origin, created.key)");
  });

  it("every webhook event offered on the settings page is emitted somewhere and documented", () => {
    const offered = JSON.parse(/const EVENTS = (\[[^\]]+\])/.exec(read("src/app/app/settings/webhooks/page.tsx"))![1]!) as string[];
    const emitters = read("src/app/api/stripe/webhook/route.ts") + read("src/lib/auth/index.ts") + read("src/app/api/webhooks/[id]/test/route.ts");
    const docText = JSON.stringify(doc("webhooks"));
    for (const e of offered.filter((x) => x !== "*")) {
      expect(emitters, e).toContain(`"${e}"`);
      expect(docText, e).toContain(e);
    }
  });
});

describe("docs claims match the code", () => {
  it("the Node verify sample in the webhooks docs accepts our signature and rejects tampering and replays", async () => {
    const code = doc("webhooks").sections.find((s) => s.code?.lang === "js")!.code!.code;
    const dir = mkdtempSync(join(tmpdir(), "docs-verify-"));
    writeFileSync(join(dir, "verify.mjs"), code);
    const { verify } = (await import(/* @vite-ignore */ pathToFileURL(join(dir, "verify.mjs")).href)) as { verify: (b: string, h: string, s: string, t?: number) => boolean };
    const body = JSON.stringify({ id: "d1", type: "test.ping", created: 1, data: {} });
    const now = Math.floor(Date.now() / 1000);
    const header = await signPayload("whsec_docs", body, now);
    expect(verify(body, header, "whsec_docs")).toBe(true);
    expect(verify(body + " ", header, "whsec_docs")).toBe(false);
    expect(verify(body, header, "other")).toBe(false);
    expect(verify(body, await signPayload("whsec_docs", body, now - 3600), "whsec_docs")).toBe(false);
  });

  it("rate limit and error code in the API docs are the real ones", () => {
    const text = JSON.stringify(doc("api"));
    expect(RULES.api).toEqual({ limit: 600, windowMs: 60_000 });
    expect(text).toContain("600 requests per minute");
    expect(read("src/lib/auth/session.ts")).toContain('"invalid_api_key"');
    expect(read("src/app/api/v1/me/route.ts")).toContain("json({ orgId })");
  });

  it("docs never point at a settings page that does not exist", () => {
    const pages = new Set(["Profile", "Security", "Members", "API keys", "Billing", "Webhooks", "Audit log"]);
    for (const d of docPages) for (const m of JSON.stringify(d).matchAll(/Settings, then ([A-Z][A-Za-z ]+?)[.,]/g)) expect(pages.has(m[1]!), `${d.slug}: ${m[0]}`).toBe(true);
  });

  it("docs/STRIPE.md lookup keys and amounts equal the plans and one-offs in product.ts", () => {
    const rows = [...read("docs/STRIPE.md").matchAll(/^\| (stepclimb_\w+) \| \$([\d.]+)/gm)].map((m) => [m[1]!, Math.round(Number(m[2]) * 100)] as const);
    const code = new Map<string, number>([...product.plans.flatMap((p) => p.prices.map((x) => [x.lookupKey, x.usd] as const)), ...oneOffs.map((o) => [o.lookupKey, o.usd] as const)]);
    expect(new Map(rows)).toEqual(code);
  });
});

// Billing path end to end against a faithful Stripe stand-in: every paid plan and interval.
function fullCatalogStripe() {
  const f = fakeStripe();
  const catalogue = product.plans.flatMap((pl) =>
    pl.prices.map((x) => ({
      id: `price_${x.lookupKey}`, lookup_key: x.lookupKey, currency: "usd", unit_amount: x.usd, metadata: { app: "stepclimb" },
      recurring: x.interval === "half" ? { interval: "month", interval_count: 6 } : { interval: x.interval },
    })),
  );
  (f.stripe as unknown as { prices: unknown }).prices = { list: async (p: { lookup_keys: string[] }) => ({ data: catalogue.filter((c) => p.lookup_keys.includes(c.lookup_key)) }) };
  return f;
}

describe("billing path: plan choice to checkout, webhook, portal, cancellation", () => {
  let db: Db;
  let f: ReturnType<typeof fakeStripe>;
  const urls = checkoutReturnUrls("https://stepclimb.test/");
  const hook = (body: string) => handleStripeWebhook(body, "good", { stripe: f.stripe, db, secret: "whsec_x", now: () => NOW });
  beforeEach(() => {
    db = createMemoryDb("stepclimb");
    f = fullCatalogStripe();
    clearPriceCache();
  });

  it("return URLs land on the billing page with a success or canceled flag", () => {
    expect(urls).toEqual({ success: "https://stepclimb.test/app/billing?checkout=success", cancel: "https://stepclimb.test/app/billing?checkout=canceled", portalReturn: "https://stepclimb.test/app/billing" });
  });

  const cases = product.plans.flatMap((pl) => pl.prices.map((x) => [pl.id, x.interval, x.lookupKey] as [PlanId, Interval, string]));
  it.each(cases)("%s %s: Checkout uses %s, tagged app, and the webhook activates its limits", async (plan, interval, lookupKey) => {
    const orgId = `org_${plan}_${interval}`;
    await createCheckoutSession(f.stripe, db, { orgId, email: "a@b.test", userId: "u" }, plan, interval, { ...urls, quantity: 3 });
    const call = f.calls.find((c) => c.method === "checkout.sessions.create")!.args as Record<string, any>;
    expect(call.line_items[0].price).toBe(`price_${lookupKey}`);
    expect(planForLookupKey(lookupKey)?.plan.id).toBe(plan);
    expect(call.metadata).toMatchObject({ app: "stepclimb", plan, interval, org_id: orgId });
    expect(call.subscription_data.metadata.app).toBe("stepclimb");
    expect(call.success_url).toBe(`${urls.success}&session_id={CHECKOUT_SESSION_ID}`);
    expect(call.cancel_url).toBe(urls.cancel);
    const def = planById(plan)!;
    if (def.perRepo) expect(call.line_items[0]).toMatchObject({ quantity: 3, adjustable_quantity: { enabled: true } });

    const cus = (await db.getBillingAccount(orgId))!.stripeCustomerId!;
    f.addSub(cus, lookupKey, "active", def.perRepo ? { items: { data: [{ current_period_end: NOW / 1000 + 86400 * 30, price: { lookup_key: lookupKey }, quantity: 3 }] } } as never : {});
    expect((await hook(event("checkout.session.completed", { customer: cus }, `evt_${orgId}`))).status).toBe(200);
    const ent = await db.getEntitlement(orgId);
    expect(effectivePlan(ent, NOW).id).toBe(plan);
    expect(limitFor(ent, "seats", NOW)).toBe(def.limits.seats);
    expect(limitFor(ent, "repos", NOW)).toBe(def.perRepo ? 3 : def.limits.repos);
  });

  it("portal opens for the paying customer; cancel at period end keeps the plan, deletion drops to Free limits", async () => {
    const orgId = "org_cancel";
    await createCheckoutSession(f.stripe, db, { orgId, email: "a@b.test", userId: "u" }, "agency", "month", urls);
    const cus = (await db.getBillingAccount(orgId))!.stripeCustomerId!;
    const sub = f.addSub(cus, "stepclimb_agency_monthly");
    await hook(event("customer.subscription.created", { customer: cus }, "evt_c1"));
    expect(limitFor(await db.getEntitlement(orgId), "seats", NOW)).toBe(MAX_SEATS);

    const portal = await createPortalSession(f.stripe, db, orgId, urls.portalReturn);
    expect(portal.url).toBe(`https://billing.stripe.test/${cus}`);

    sub.cancel_at_period_end = true;
    await hook(event("customer.subscription.updated", { customer: cus }, "evt_c2"));
    const ending = await db.getEntitlement(orgId);
    expect(ending).toMatchObject({ plan: "agency", cancelAtPeriodEnd: true });
    expect(effectivePlan(ending, NOW).id).toBe("agency");

    sub.status = "canceled";
    await hook(event("customer.subscription.deleted", { customer: cus }, "evt_c3"));
    const after = await db.getEntitlement(orgId);
    expect(effectivePlan(after, NOW).id).toBe("free");
    const free = planById("free")!;
    expect(limitFor(after, "seats", NOW)).toBe(free.limits.seats);
    expect(limitFor(after, "repos", NOW)).toBe(free.limits.repos);
  });
});
