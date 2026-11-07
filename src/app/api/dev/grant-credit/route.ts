import { e2eMode } from "@/lib/env";
import { getOrgContext } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { json } from "@/lib/http";
import { grantCredit } from "@/lib/runs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** E2E only: grants the signed in org one credit of a kind. 404 unless E2E_OUTBOX=1. */
export async function POST(req: Request) {
  if (!e2eMode()) return json({ error: "not_found" }, 404);
  const ctx = await getOrgContext(req.headers);
  if (!ctx) return json({ error: "unauthorized" }, 401);
  const kind = new URL(req.url).searchParams.get("kind") ?? "to_previous";
  await grantCredit(await getDb(), ctx.org.id, kind as never, null);
  return json({ ok: true });
}
