import { oneOffs } from "@/config/product";
import { requireOrg } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { json, withApi } from "@/lib/http";
import type { CreditDoc } from "@/lib/runs/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Credit balance by kind (one time packs bought through Checkout), with the next expiry. Read only. */
export const GET = withApi(async () => {
  const ctx = await requireOrg();
  const now = Date.now();
  const live = (await (await getDb()).docs.find<CreditDoc>("credits", { accountId: ctx.org.id })).filter((c) => c.remaining > 0 && new Date(c.expiresAt).getTime() > now);
  return json({ credits: oneOffs.map((o) => {
    const mine = live.filter((c) => c.kind === o.kind);
    return { kind: o.kind, name: o.name, usd: o.usd / 100, remaining: mine.reduce((n, c) => n + c.remaining, 0), nextExpiry: mine.length ? new Date(Math.min(...mine.map((c) => new Date(c.expiresAt).getTime()))).toISOString() : null };
  }) });
}, { route: "billing/credits" });
