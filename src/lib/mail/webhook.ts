import { createHmac, timingSafeEqual } from "node:crypto";
import type { Db } from "@/lib/db";
import { applyMailEvent } from "./notify";

/** Svix style signature (what Resend sends): `svix-signature: v1,<base64 hmac of "id.timestamp.body">`, 5 minute tolerance. */
export function verifySvix(secret: string, h: { id: string | null; timestamp: string | null; signature: string | null }, raw: string, nowMs = Date.now()): boolean {
  if (!secret || !h.id || !h.timestamp || !h.signature) return false;
  const ts = Number(h.timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > 300) return false;
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  const expected = createHmac("sha256", key).update(`${h.id}.${h.timestamp}.${raw}`).digest();
  return h.signature.split(" ").some((part) => {
    const [v, sig] = part.split(",");
    if (v !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export type MailWebhookResult = { status: 200 | 400 | 401 | 503; body: Record<string, unknown> };

/** Provider webhook: verified, then bounces and complaints go straight onto the suppression list. */
export async function processMailWebhook(db: Db, i: { secret: string | undefined; raw: string; id: string | null; timestamp: string | null; signature: string | null }, nowMs = Date.now()): Promise<MailWebhookResult> {
  if (!i.secret) return { status: 503, body: { error: "not_configured" } };
  if (!verifySvix(i.secret, { id: i.id, timestamp: i.timestamp, signature: i.signature }, i.raw, nowMs)) return { status: 401, body: { error: "bad_signature" } };
  let p: { type?: string; data?: { to?: string[] | string; bounce?: { type?: string } } };
  try { p = JSON.parse(i.raw); } catch { return { status: 400, body: { error: "bad_json" } }; }
  const to = typeof p.data?.to === "string" ? [p.data.to] : (p.data?.to ?? []);
  const r = await applyMailEvent(db, { type: p.type ?? "", to, ...(p.data?.bounce?.type ? { bounceType: p.data.bounce.type } : {}) });
  return { status: 200, body: { ok: true, suppressed: r.suppressed.length } };
}
