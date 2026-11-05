import { getOrgContext } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { createFixtureApi, FIXTURE_INSTALLATION_ID, fixtureInstallationPayload, FIXTURE_LOGIN } from "@/lib/github/fixtures";
import { scanRepo } from "@/lib/github/scan";
import { applyGithubEvent, claimInstallations, syncInstallation, type RepoDoc } from "@/lib/github/sync";
import { json } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** E2E only: installs the fixture GitHub account for the signed in org and scans every repo. 404 unless E2E_OUTBOX=1. */
export async function POST(req: Request) {
  if (process.env.E2E_OUTBOX !== "1") return json({ error: "not_found" }, 404);
  const ctx = await getOrgContext(req.headers);
  if (!ctx) return json({ error: "unauthorized" }, 401);
  const db = await getDb();
  const api = createFixtureApi();
  // reset so every e2e org can claim the same fixture account
  await db.docs.remove("repos", { installationId: FIXTURE_INSTALLATION_ID });
  await db.docs.remove("installations", { externalId: FIXTURE_INSTALLATION_ID });
  await applyGithubEvent(db, "installation", fixtureInstallationPayload());
  await claimInstallations(db, ctx.org.id, { installationId: FIXTURE_INSTALLATION_ID, githubLogin: FIXTURE_LOGIN });
  await syncInstallation(db, api, FIXTURE_INSTALLATION_ID);
  const repos = await db.docs.find<RepoDoc>("repos", { installationId: FIXTURE_INSTALLATION_ID });
  const scans: Record<string, string> = {};
  for (const r of repos) scans[r.fullName] = (await scanRepo(db, api, r, { today: new Date("2026-11-05T00:00:00Z") })).id;
  return json({ repos: repos.length, scans });
}
