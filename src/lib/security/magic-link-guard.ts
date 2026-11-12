import type { Db } from "@/lib/db";
import { clientIp, json } from "@/lib/http";
import { verifyAltcha } from "./altcha";
import { rateLimit, RULES } from "./ratelimit";

/**
 * Rate limit key for an address: case, surrounding space, `+tags` and Gmail dots do not make a new mailbox, so
 * `victim+1@`, `victim+2@` ... share the victim's budget (no mail bombing through sub-addresses).
 */
export function mailboxKey(email: string): string {
  const e = email.trim().toLowerCase().slice(0, 254);
  const at = e.lastIndexOf("@");
  if (at < 1) return e;
  let local = e.slice(0, at).split("+")[0]!;
  const domain = e.slice(at + 1).replace(/\.+$/, "");
  if (domain === "gmail.com" || domain === "googlemail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

/**
 * Guard for the public magic link form: per IP and per address rate limits, then an ALTCHA proof (`x-altcha` header, solved
 * in the browser against /api/altcha, single use). Returns a response to send, or null to let the request through.
 */
export async function guardMagicLink(req: Request, db: Db): Promise<Response | null> {
  if (!(await rateLimit(`auth:ip:${clientIp(req)}`, RULES.authIp, db)).ok) return json({ error: "rate_limited" }, 429);
  const email = ((await req.clone().json().catch(() => ({}))) as { email?: unknown }).email;
  if (typeof email === "string" && !(await rateLimit(`auth:email:${mailboxKey(email)}`, RULES.authEmail, db)).ok) return json({ error: "rate_limited" }, 429);
  if (!(await verifyAltcha(req.headers.get("x-altcha"), db))) return json({ error: "altcha_required" }, 400);
  return null;
}

/**
 * Guard for member invitations (they send mail to a third party): per IP and per invited address, so one account cannot
 * mail-bomb a victim or burn the sending reputation. Returns a response to send, or null.
 */
export async function guardInvite(req: Request, db: Db): Promise<Response | null> {
  if (!(await rateLimit(`invite:ip:${clientIp(req)}`, RULES.inviteIp, db)).ok) return json({ error: "rate_limited" }, 429);
  const email = ((await req.clone().json().catch(() => ({}))) as { email?: unknown }).email;
  if (typeof email === "string" && !(await rateLimit(`invite:email:${mailboxKey(email)}`, RULES.inviteEmail, db)).ok) return json({ error: "rate_limited" }, 429);
  return null;
}

/** Decoded, lower case, no trailing slash: `/Sign-In/Magic%2Dlink/` must not slip past the guard. */
export function authPath(url: string): string {
  const p = new URL(url).pathname;
  let d = p;
  try { d = decodeURIComponent(p); } catch { /* keep raw */ }
  return d.toLowerCase().replace(/\/+$/, "");
}
