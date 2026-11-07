import { z } from "zod";
import { requireOrg, requirePermission } from "@/lib/auth/session";
import { requireStripe } from "@/lib/billing/stripe";
import { getDb } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { flagOn, getFlags } from "@/lib/flags";
import { HttpError, json, readJson, withApi } from "@/lib/http";
import { createCreditCheckout } from "@/lib/runs/credit-checkout";
import { enforceRateLimit, RULES } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ kind: z.enum(["to_latest", "to_previous", "older_hop", "side_task", "small_converter", "extended_verify"]), returnTo: z.string().startsWith("/app/").max(200).optional() });

/** POST /api/billing/credit-checkout: pay per run. One time Stripe Checkout for an existing one off price; the webhook grants the credit. */
export const POST = withApi(async (req) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "billing", "manage");
  if (!flagOn(await getFlags(), "payments_enabled")) throw new HttpError(503, "payments_disabled");
  const body = await readJson(req, Body);
  const db = await getDb();
  await enforceRateLimit(`billing:${ctx.user.id}`, RULES.billing, db);
  const base = appUrl();
  const back = `${base}${body.returnTo ?? "/app/work-orders"}`;
  const r = await createCreditCheckout(requireStripe(), db, { orgId: ctx.org.id, email: ctx.user.email, userId: ctx.user.id }, body.kind, { success: back, cancel: back });
  return json(r);
}, { route: "billing/credit-checkout" });
