import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { getGithubApi } from "@/lib/github/client";
import { claimInstallations, syncInstallation } from "@/lib/github/sync";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GitHub App "Setup URL": after install the user lands here with ?installation_id. Claims it for their org, syncs, opens the Hangar. */
export async function GET(req: Request) {
  const ctx = await getOrgContext(req.headers);
  if (!ctx) return NextResponse.redirect(`${appUrl()}/sign-in?next=${encodeURIComponent("/app")}`, 303);
  const id = new URL(req.url).searchParams.get("installation_id") ?? undefined;
  const db = await getDb();
  const login = (ctx.user as unknown as { githubLogin?: string | null }).githubLogin ?? null;
  try {
    const claimed = await claimInstallations(db, ctx.org.id, { installationId: id && /^\d+$/.test(id) ? id : undefined, githubLogin: login });
    const api = await getGithubApi(db);
    if (api) for (const c of claimed) await syncInstallation(db, api, c);
  } catch (e) {
    log.error("github_setup_failed", { route: "github/setup", message: (e as Error).message });
  }
  return NextResponse.redirect(`${appUrl()}/app?installed=1`, 303);
}
