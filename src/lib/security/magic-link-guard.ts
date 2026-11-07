import type { Db } from "@/lib/db";
import { clientIp, json } from "@/lib/http";
import { verifyAltcha } from "./altcha";
import { rateLimit, RULES } from "./ratelimit";

/**
 * Guard for the public magic link form: per IP and per address rate limits, then an ALTCHA proof (`x-altcha` header, solved
 * in the browser against /api/altcha, single use). Returns a response to send, or null to let the request through.
 */
export async function guardMagicLink(req: Request, db: Db): Promise<Response | null> {
  if (!(await rateLimit(`auth:ip:${clientIp(req)}`, RULES.authIp, db)).ok) return json({ error: "rate_limited" }, 429);
  const email = ((await req.clone().json().catch(() => ({}))) as { email?: unknown }).email;
  if (typeof email === "string" && !(await rateLimit(`auth:email:${email.toLowerCase()}`, RULES.authEmail, db)).ok) return json({ error: "rate_limited" }, 429);
  if (!(await verifyAltcha(req.headers.get("x-altcha"), db))) return json({ error: "altcha_required" }, 400);
  return null;
}
