import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { json } from "@/lib/http";
import { processMailWebhook } from "@/lib/mail/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Provider bounce and complaint webhook (Resend, Svix signed). No session: authenticity is the signature. */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 1_000_000) return json({ error: "body_too_large" }, 413);
  const r = await processMailWebhook(await getDb(), { secret: env().MAIL_WEBHOOK_SECRET, raw, id: req.headers.get("svix-id"), timestamp: req.headers.get("svix-timestamp"), signature: req.headers.get("svix-signature") });
  return json(r.body, r.status);
}
