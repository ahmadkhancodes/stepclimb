import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { appUrl, env } from "@/lib/env";
import { isFounderAdmin, getSession } from "@/lib/auth/session";
import { convertManifestCode, saveAppCredentials } from "@/lib/github/app-store";
import { verifyState } from "@/lib/github/manifest";
import { log } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const back = (q: string) => NextResponse.redirect(`${appUrl()}/setup/github-app?${q}`, 303);

/** Manifest flow step 2: GitHub redirects here with ?code&state. Founder only, one time, credentials stored encrypted. */
export async function GET(req: Request) {
  const s = await getSession(req.headers);
  if (!s || !isFounderAdmin(s.user.email)) return new NextResponse("Not found", { status: 404 });
  const url = new URL(req.url);
  const secret = env().BETTER_AUTH_SECRET ?? "dev-only-secret-dev-only-secret-0000";
  if (!(await verifyState(secret, url.searchParams.get("state")))) return back("error=state");
  const code = url.searchParams.get("code");
  if (!code) return back("error=code");
  const db = await getDb();
  try {
    const saved = await saveAppCredentials(db, await convertManifestCode(code));
    if (!saved) return back("error=exists");
    await db.appendAudit({ orgId: null, actorId: s.user.id, action: "github_app.created", target: "github_app" });
  } catch (e) {
    log.error("github_manifest_failed", { route: "github/manifest/callback", message: (e as Error).message });
    return back("error=convert");
  }
  return back("done=1");
}
