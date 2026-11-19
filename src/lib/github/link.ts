import { getAuth } from "@/lib/auth";
import type { Db } from "@/lib/db";
import { log } from "@/lib/logger";
import { getGithubApi } from "./client";
import { claimInstallations, syncInstallation, userInstallationIds } from "./sync";

/** The installations GitHub says this user can access, through their own GitHub sign in token. Null without GitHub sign in. */
export async function visibleInstallations(h: Headers): Promise<string[] | null> {
  try {
    const auth = await getAuth();
    const accounts = (await auth.api.listUserAccounts({ headers: h })) as { id: string; providerId: string }[];
    const gh = accounts.find((a) => a.providerId === "github");
    if (!gh) return null;
    const t = (await auth.api.getAccessToken({ body: { accountId: gh.id }, headers: h })) as { accessToken?: string };
    return t.accessToken ? await userInstallationIds(t.accessToken) : null;
  } catch (e) {
    log.warn("github_user_installations_failed", { route: "github/link", message: (e as Error).message });
    return null;
  }
}

/**
 * Links every installation GitHub shows to this user's own token (D-37: the setup redirect id alone is never proof).
 * Called from the setup redirect AND from the app overview, so a user who signed in with GitHub after installing is linked
 * on the next page view instead of having to press Configure again.
 */
export async function linkInstallationsFor(db: Db, orgId: string, h: Headers, githubLogin: string | null, installationId?: string): Promise<{ claimed: string[]; visible: string[] | null }> {
  // nothing waiting to be linked and no id to look at: skip the GitHub call (this runs on every overview view)
  if (!installationId && (await db.docs.find("installations", { accountId: null }, { limit: 1 })).length === 0) return { claimed: [], visible: [] };
  const visible = await visibleInstallations(h);
  const claimed = await claimInstallations(db, orgId, { installationId, githubLogin, visibleIds: visible });
  const api = claimed.length ? await getGithubApi(db) : null;
  if (api) for (const c of claimed) await syncInstallation(db, api, c);
  return { claimed, visible };
}
