import { requireOrg } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { loadHangar } from "@/lib/github/hangar";
import { hangarCsv } from "@/lib/github/hangar-csv";
import { withApi } from "@/lib/http";
import { enforceRateLimit, RULES } from "@/lib/security/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/repos/export: the signed-in organisation's Hangar as CSV (their own repos only). */
export const GET = withApi(async () => {
  const ctx = await requireOrg();
  const db = await getDb();
  await enforceRateLimit(`export:hangar:${ctx.user.id}`, RULES.billing, db);
  const csv = hangarCsv((await loadHangar(db, ctx.org.id)).rows);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="stepclimb-hangar-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}, { route: "repos/export" });
