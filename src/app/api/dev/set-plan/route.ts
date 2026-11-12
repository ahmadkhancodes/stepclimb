import { e2eMode } from "@/lib/env";
import { getOrgContext } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** E2E only: puts the signed in org on the Agency plan (seats for member tests) as the Stripe webhook would. 404 unless E2E_OUTBOX=1. */
export async function POST(req: Request) {
  if (!e2eMode()) return json({ error: "not_found" }, 404);
  const ctx = await getOrgContext(req.headers);
  if (!ctx) return json({ error: "unauthorized" }, 401);
  const now = Date.now();
  await (await getDb()).setEntitlement(ctx.org.id, { isPaid: true, status: "active", plan: "agency", interval: "year", expiresAt: now + 30 * 864e5, trialStartedAt: null, cancelAtPeriodEnd: false, checkedAt: now, trialUsed: true, subscriptionId: null, lifetimePaymentIntentId: null, pastDueSince: null });
  return json({ ok: true });
}
