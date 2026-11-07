import { z } from "zod";
import { getState } from "@/lib/autopilot/state";
import { validTimezone } from "@/lib/autopilot/schedule";
import { requireOrg, requirePermission } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import type { RepoDoc } from "@/lib/github/sync";
import { HttpError, json, readJson, withApi } from "@/lib/http";
import { isSubscriber } from "@/lib/runs/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ weekly: z.boolean().optional(), timezone: z.string().min(1).max(64).optional(), quietMode: z.boolean().optional() });

async function load(id: string, orgId: string) {
  const db = await getDb();
  const repo = await db.docs.get<RepoDoc>("repos", decodeURIComponent(id));
  if (!repo || repo.accountId !== orgId) throw new HttpError(404, "not_found");
  return { db, repo };
}

const view = async (db: Awaited<ReturnType<typeof getDb>>, repo: RepoDoc & { id: string }) => {
  const s = await getState(db, repo.id);
  return { weekly: !!repo.autopilotWeekly, timezone: validTimezone(repo.timezone), quietMode: !!repo.quietMode, openPr: s?.prOpen ? s.prNumber : null, closedStreak: s?.closedStreak ?? 0, quietSuggested: !!s?.quietSuggested };
};

export const GET = withApi(async (_req, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireOrg();
  const { db, repo } = await load((await params).id, ctx.org.id);
  return json(await view(db, repo));
}, { route: "repos/autopilot/get" });

/** Repo settings toggles. Weekly autopilot is part of the paid plans: free accounts get 402 plan_required. */
export const POST = withApi(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireOrg();
  requirePermission(ctx, "data", "write");
  const b = await readJson(req, Body);
  const { db, repo } = await load((await params).id, ctx.org.id);
  if (b.weekly === true && !isSubscriber(await db.getEntitlement(ctx.org.id))) throw new HttpError(402, "plan_required");
  if (b.timezone !== undefined && validTimezone(b.timezone) !== b.timezone) throw new HttpError(400, "invalid_timezone");
  await db.docs.put("repos", repo.id, { ...(b.weekly !== undefined ? { autopilotWeekly: b.weekly } : {}), ...(b.timezone !== undefined ? { timezone: b.timezone } : {}), ...(b.quietMode !== undefined ? { quietMode: b.quietMode } : {}), updatedAt: new Date() });
  return json(await view(db, { ...repo, ...(b.weekly !== undefined ? { autopilotWeekly: b.weekly } : {}), ...(b.timezone !== undefined ? { timezone: b.timezone } : {}), ...(b.quietMode !== undefined ? { quietMode: b.quietMode } : {}) }));
}, { route: "repos/autopilot/set" });
