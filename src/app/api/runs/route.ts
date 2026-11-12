import { after } from "next/server";
import { z } from "zod";
import { isFounderAdmin, requireOrg, requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import type { RepoDoc } from "@/lib/github/sync";
import { HttpError, json, readJson, withApi } from "@/lib/http";
import { dispatchRun, RunError, startRun } from "@/lib/runs/service";
import { getRunDeps } from "@/lib/runs/runtime";
import { listRuns } from "@/lib/runs/store";
import { githubAccountCreatedAt } from "@/lib/runs/free-tier";
import { saveContact } from "@/lib/mail/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ catchUpTo: z.number().int().min(11).max(13).optional(), repoId: z.string().min(1), hopFrom: z.number().int().min(10).max(12), appPath: z.string().max(200).regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._\/-]*$/, "bad_app_path").optional(), extendedVerify: z.boolean().optional(), kind: z.enum(["upgrade", "noop"]).optional() });

const view = (r: Awaited<ReturnType<typeof listRuns>>[number]) => ({ id: r.id, status: r.status, fullName: r.fullName, hopFrom: r.hopFrom, hopTo: r.hopTo, prUrl: r.prUrl, checkConclusion: r.checkConclusion, createdAt: r.createdAt });

export const GET = withApi(async () => {
  const ctx = await requireOrg();
  return json({ runs: (await listRuns(await getDb(), ctx.org.id)).map(view) });
}, { route: "runs/list" });

/** POST /api/runs: start a work order. 402 payment_required carries the credit kind to buy (pay per run). */
export const POST = withApi(async (req) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "write");
  const body = await readJson(req, Body);
  if (body.kind === "noop" && !isFounderAdmin(ctx.user)) throw new HttpError(403, "forbidden"); // P2-1: the no-op probe opens a PR for free
  const db = await getDb();
  if ((await db.hitRateLimit(`runs:${ctx.org.id}`, 60_000)) > 10) throw new HttpError(429, "rate_limited");
  const repo = await db.docs.get<RepoDoc>("repos", body.repoId);
  if (!repo || repo.accountId !== ctx.org.id) throw new HttpError(404, "not_found");
  await saveContact(db, ctx.org.id, ctx.user.email); // run mail goes to whoever last started a work order
  const deps = await getRunDeps(db);
  if (!deps) throw new HttpError(503, "runner_unavailable"); // checked before any credit is taken
  const inst = await db.docs.get<{ accountLogin?: string }>("installations", repo.installationId);
  const githubCreatedAt = await githubAccountCreatedAt(db, inst?.accountLogin ?? "");
  if (body.catchUpTo !== undefined && body.catchUpTo <= body.hopFrom + 1) throw new HttpError(400, "bad_hop");
  try {
    const { run, created } = await startRun(deps, { accountId: ctx.org.id, repo, githubCreatedAt, ...(body.catchUpTo ? { chainTo: body.catchUpTo } : {}), appPath: body.appPath ?? "", hopFrom: body.hopFrom, hopTo: body.hopFrom + 1, extendedVerify: body.extendedVerify, kind: body.kind, idempotencyKey: req.headers.get("idempotency-key") });
    if (created) after(async () => { await dispatchRun(deps, run.id).catch(() => undefined); });
    return json({ id: run.id, status: run.status }, created ? 201 : 200);
  } catch (e) {
    if (e instanceof RunError) return json({ error: e.code, ...e.extra }, e.status);
    throw e;
  }
}, { route: "runs/start" });
