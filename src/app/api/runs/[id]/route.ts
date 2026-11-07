import { requireOrg } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { HttpError, json, withApi } from "@/lib/http";
import { getRun, listLogs, listSquawks, listSteps } from "@/lib/runs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/runs/:id?after=<log seq>: status, steps, squawks and new log chunks (the UI polls this). */
export const GET = withApi(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireOrg();
  const { id } = await params;
  const db = await getDb();
  const run = await getRun(db, id);
  if (!run || run.accountId !== ctx.org.id) throw new HttpError(404, "not_found");
  const after = Number(new URL(req.url).searchParams.get("after") ?? 0) || 0;
  const { eventSecret: _s, idempotencyKey: _i, ...safe } = run;
  void _s; void _i;
  return json({ run: safe, steps: await listSteps(db, id), squawks: await listSquawks(db, id), logs: await listLogs(db, id, after) });
}, { route: "runs/get" });
