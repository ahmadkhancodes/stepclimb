import { requireOrg, requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { HttpError, json, withApi } from "@/lib/http";
import { getRunDeps } from "@/lib/runs/runtime";
import { cancelRun } from "@/lib/runs/service";
import { getRun } from "@/lib/runs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApi(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "write");
  const { id } = await params;
  const db = await getDb();
  const run = await getRun(db, id);
  if (!run || run.accountId !== ctx.org.id) throw new HttpError(404, "not_found");
  const deps = await getRunDeps(db);
  if (!deps) throw new HttpError(503, "runner_unavailable");
  await cancelRun(deps, id);
  return json({ ok: true });
}, { route: "runs/cancel" });
