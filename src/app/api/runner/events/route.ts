import { z } from "zod";
import { getDb } from "@/lib/db";
import { HttpError, json, readJson, withApi } from "@/lib/http";
import { getRunDeps } from "@/lib/runs/runtime";
import { ingestEvent } from "@/lib/runs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ runId: z.string().min(1), seq: z.number().int().min(1), event: z.object({ type: z.string().max(40) }).loose() });

/** POST /api/runner/events: signed events from a sandbox (x-stepclimb-signature = HMAC-SHA256 with the per run secret). No session, no CSRF. */
export const POST = withApi(async (req) => {
  const body = await readJson(req, Body);
  const db = await getDb();
  const deps = await getRunDeps(db);
  if (!deps) throw new HttpError(503, "runner_unavailable");
  const r = await ingestEvent(deps, body.runId, { seq: body.seq, event: body.event as never }, req.headers.get("x-stepclimb-signature"));
  if (r === "bad_signature") throw new HttpError(401, "bad_signature");
  if (r === "not_found") throw new HttpError(404, "not_found");
  if (r === "invalid") throw new HttpError(400, "invalid_event");
  return json({ ok: r === "ok", result: r }, r === "ok" ? 200 : 409);
}, { csrf: false, route: "runner/events" });
