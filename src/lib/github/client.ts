import { fixturesMode } from "@/lib/env";
import type { Db } from "@/lib/db";
import { loadAppCredentials } from "./app-store";
import { createGithubApi, type GithubApi } from "./api";
import { createFixtureApi } from "./fixtures";

/** Fixture API when GITHUB_FIXTURES=1 (tests, e2e), else the real App client from the stored credentials, else null. */
export async function getGithubApi(db: Db): Promise<GithubApi | null> {
  if (fixturesMode()) return createFixtureApi();
  const creds = await loadAppCredentials(db);
  return creds ? createGithubApi(creds) : null;
}
