import { getDb } from "@/lib/db";
import { safeEqual } from "@/lib/ids";
import { unsubscribeToken } from "@/lib/mail";
import { clientIp } from "@/lib/http";
import { rateLimit, RULES } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function valid(url: URL) {
  const e = url.searchParams.get("e") ?? "";
  const s = url.searchParams.get("s") ?? "";
  const t = url.searchParams.get("t") ?? "";
  return !!e && !!s && !!t && safeEqual(t, await unsubscribeToken(e, s)) ? { e, s } : null;
}
async function limited(req: Request) {
  return !(await rateLimit(`unsub:${clientIp(req)}`, RULES.publicForm)).ok;
}

const page = (title: string, body: string, status: number, form = "") =>
  new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><body style="font-family:system-ui;max-width:560px;margin:64px auto;padding:0 16px"><main><h1>${title}</h1><p>${body}</p>${form}<p><a href="/">Back to the site</a></p></main></body></html>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

/** RFC 8058 one-click: mail clients POST `List-Unsubscribe=One-Click` to this URL. No CSRF check (signed token). */
export async function POST(req: Request) {
  if (await limited(req)) return new Response("Too many requests", { status: 429 });
  const v = await valid(new URL(req.url));
  if (v) await (await getDb()).addSuppression({ email: v.e, scope: v.s, reason: "unsubscribe" });
  if ((req.headers.get("accept") ?? "").includes("text/html"))
    return v ? page("You are unsubscribed", "You will not get these emails again. Sign-in emails and receipts still arrive.", 200) : page("This link is not valid", "Use the link from your most recent email.", 400);
  return new Response(v ? "Unsubscribed" : "Invalid link", { status: v ? 200 : 400 });
}

/** Humans get a confirmation button, so link scanners that open the URL cannot unsubscribe anyone. */
export async function GET(req: Request) {
  if (await limited(req)) return new Response("Too many requests", { status: 429 });
  const url = new URL(req.url);
  const v = await valid(url);
  if (!v) return page("This link is not valid", "Use the link from your most recent email.", 400);
  const form = `<form method="post" action="/api/mail/unsubscribe${url.search.replace(/&/g, "&amp;")}"><input type="hidden" name="List-Unsubscribe" value="One-Click"><button type="submit" style="min-height:44px;padding:0 20px;font-size:16px">Unsubscribe ${v.e.replace(/[<>&"]/g, "")}</button></form>`;
  return page("Stop these emails?", "Confirm to stop product notifications from Stepclimb. Sign-in emails and receipts still arrive.", 200, form);
}
