import { requireOrg } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getGithubApi } from "@/lib/github/client";
import { scanRepo } from "@/lib/github/scan";
import type { RepoDoc } from "@/lib/github/sync";
import { HttpError, json, withApi } from "@/lib/http";
import { clientIp } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/repos/:id/scan: free inspection of one repo (GitHub contents API only). */
export const POST = withApi(async (req, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireOrg();
  const db = await getDb();
  if ((await db.hitRateLimit(`scan:${ctx.org.id}:${clientIp(req)}`, 60_000)) > 20) throw new HttpError(429, "rate_limited");
  const { id } = await params;
  const repo = await db.docs.get<RepoDoc>("repos", decodeURIComponent(id));
  if (!repo || repo.accountId !== ctx.org.id) throw new HttpError(404, "not_found");
  const api = await getGithubApi(db);
  if (!api) throw new HttpError(503, "github_not_configured");
  const scan = await scanRepo(db, api, repo);
  return json({ id: scan.id, effortBand: scan.effortBand });
}, { route: "repos/scan" });
