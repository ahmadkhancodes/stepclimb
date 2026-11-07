import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { getGithubApi } from "@/lib/github/client";
import { getAuth } from "@/lib/auth";
import { claimInstallations, syncInstallation, userInstallationIds } from "@/lib/github/sync";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** The installations GitHub says this user can access, through their own GitHub sign in token. Null without GitHub sign in. */
async function visibleInstallations(h: Headers): Promise<string[] | null> {
  try {
    const auth = await getAuth();
    const accounts = (await auth.api.listUserAccounts({ headers: h })) as { id: string; providerId: string }[];
    const gh = accounts.find((a) => a.providerId === "github");
    if (!gh) return null;
    const t = (await auth.api.getAccessToken({ body: { accountId: gh.id }, headers: h })) as { accessToken?: string };
    return t.accessToken ? await userInstallationIds(t.accessToken) : null;
  } catch (e) {
    log.warn("github_user_installations_failed", { route: "github/setup", message: (e as Error).message });
    return null;
  }
}

/**
 * GitHub App "Setup URL": after install the user lands here with ?installation_id. The id alone is not trusted (unsigned,
 * guessable): the claim needs GitHub to list it for the user's own token, or a personal install matching their login.
 */
export async function GET(req: Request) {
  const ctx = await getOrgContext(req.headers);
  if (!ctx) return NextResponse.redirect(`${appUrl()}/sign-in?next=${encodeURIComponent("/app")}`, 303);
  const id = new URL(req.url).searchParams.get("installation_id") ?? undefined;
  const db = await getDb();
  const login = (ctx.user as unknown as { githubLogin?: string | null }).githubLogin ?? null;
  try {
    const visibleIds = await visibleInstallations(req.headers);
    const claimed = await claimInstallations(db, ctx.org.id, { installationId: id && /^\d+$/.test(id) ? id : undefined, githubLogin: login, visibleIds });
    if (id && claimed.length === 0 && !visibleIds) return NextResponse.redirect(`${appUrl()}/app?installed=1&link=github`, 303);
    const api = await getGithubApi(db);
    if (api) for (const c of claimed) await syncInstallation(db, api, c);
  } catch (e) {
    log.error("github_setup_failed", { route: "github/setup", message: (e as Error).message });
  }
  return NextResponse.redirect(`${appUrl()}/app?installed=1`, 303);
}
