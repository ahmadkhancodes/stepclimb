import { NextResponse } from "next/server";
import { getOrgContext } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { linkInstallationsFor } from "@/lib/github/link";
import { reconcileInstallations } from "@/lib/github/reconcile";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
    // a lost `installation` webhook must not hide a fresh install: fill the rows from GitHub first, then link
    await reconcileInstallations(db).catch((e) => log.warn("reconcile_failed", { route: "github/setup", message: (e as Error).message }));
    const { claimed, visible } = await linkInstallationsFor(db, ctx.org.id, req.headers, login, id && /^\d+$/.test(id) ? id : undefined);
    if (id && claimed.length === 0 && !visible) return NextResponse.redirect(`${appUrl()}/app?installed=1&link=github`, 303);
  } catch (e) {
    log.error("github_setup_failed", { route: "github/setup", message: (e as Error).message });
  }
  return NextResponse.redirect(`${appUrl()}/app?installed=1`, 303);
}
