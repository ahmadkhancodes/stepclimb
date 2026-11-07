import type Stripe from "stripe";
import { oneOffs } from "@/config/product";
import { ensureCustomer, type BillingSubject } from "@/lib/billing/checkout";
import type { Db } from "@/lib/db/types";
import { HttpError } from "@/lib/http";
import type { CreditKind } from "./types";

/** Pay per run: a one time Checkout for the existing one off prices (docs/STRIPE.md). No new pricing. */
export async function createCreditCheckout(
  stripe: Pick<Stripe, "customers" | "prices" | "checkout">,
  db: Db,
  s: BillingSubject,
  kind: CreditKind,
  urls: { success: string; cancel: string },
): Promise<{ url: string }> {
  const offer = oneOffs.find((o) => o.kind === kind);
  if (!offer) throw new HttpError(400, "bad_credit_kind");
  const found = await stripe.prices.list({ lookup_keys: [offer.lookupKey], active: true, limit: 5 });
  const price = found.data.find((p) => p.metadata?.app === db.app && p.lookup_key === offer.lookupKey);
  if (!price) throw new HttpError(400, "unknown_price");
  const customer = await ensureCustomer(stripe, db, s);
  const meta = { app: db.app, org_id: s.orgId, user_id: s.userId, credit_kind: kind, lookup_key: offer.lookupKey };
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customer.id,
    client_reference_id: s.orgId,
    line_items: [{ price: price.id, quantity: 1 }],
    allow_promotion_codes: true,
    automatic_tax: { enabled: false },
    billing_address_collection: "auto",
    customer_update: { address: "auto", name: "auto" },
    payment_intent_data: { metadata: meta },
    metadata: meta,
    success_url: `${urls.success}${urls.success.includes("?") ? "&" : "?"}session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: urls.cancel,
  });
  if (!session.url) throw new HttpError(500, "no_checkout_url");
  return { url: session.url };
}
