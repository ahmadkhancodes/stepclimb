import { z } from "zod";
import { AdminError, refundRun, stripeRefunder } from "@/lib/admin/console";
import { requireFounder } from "@/lib/auth/session";
import { getStripe } from "@/lib/billing/stripe";
import { getDb } from "@/lib/db";
import { json, readJson, withApi } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ runId: z.string().min(1), mode: z.enum(["credit", "money"]), reason: z.string().min(3).max(200) });

/** Founder refund tool: give a run's credit back, or refund the payment that bought it. */
export const POST = withApi(async (req) => {
  const { user } = await requireFounder();
  const body = await readJson(req, Body);
  const db = await getDb();
  const stripe = getStripe();
  try {
    return json(await refundRun(db, { ...body, actorId: user.id }, stripe ? stripeRefunder(stripe, db.app) : undefined));
  } catch (e) {
    if (e instanceof AdminError) return json({ error: e.code }, e.status);
    throw e;
  }
}, { route: "admin/refund" });
