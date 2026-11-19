import { join } from "node:path";
import type { Db } from "@/lib/db";
import { appUrl, fixturesMode } from "@/lib/env";
import { loadRecipes } from "@/lib/engine/recipes";
import { loadRules } from "@/lib/engine/repair";
import { loadAppCredentials } from "@/lib/github/app-store";
import { FIXTURE_REPOS } from "@/lib/github/fixtures";
import { FakeRunner } from "./fake-runner";
import { createFixtureHost } from "./fixture-host";
import { createGithubHost, FINALIZE_TOKEN_PERMISSIONS, mintScopedToken, RUN_TOKEN_PERMISSIONS } from "./git-host";
import { AGENT_DIR, VercelSandboxRunner } from "./sandbox-runner";
import { createVercelDriver } from "./sandbox/vercel-driver";
import type { RunDeps } from "./service";
import { simulatedUpdateDeps, simulatedVerify } from "./simulated-verify";

const g = globalThis as unknown as { __stepclimbFixtureRun?: { runner: FakeRunner; host: ReturnType<typeof createFixtureHost> } };

/** Fixture mode (GITHUB_FIXTURES=1): fake runner on a fixture repo, recording GitHub host. Used by e2e. */
function fixtureRun() {
  if (!g.__stepclimbFixtureRun) {
    const repo = FIXTURE_REPOS.find((r) => r.fullName.endsWith("/billing-portal"))!;
    const host = createFixtureHost();
    const runner = new FakeRunner({
      host,
      repo: repo.files,
      recipes: loadRecipes(join(process.cwd(), "recipes")),
      rules: loadRules(join(process.cwd(), "repair-rules")),
      verify: (stage, fs) => simulatedVerify(stage, fs),
      updateDeps: simulatedUpdateDeps,
    });
    g.__stepclimbFixtureRun = { runner, host };
  }
  return g.__stepclimbFixtureRun;
}

/** The runner image (PHP, Composer, the run user) is a Vercel Sandbox snapshot: `npm run runner:snapshot` builds it. */
export const runnerSnapshotId = () => process.env.RUNNER_SNAPSHOT_ID?.trim() || null;

/** Explicit credentials only off Vercel; on Vercel the SDK uses the project's OIDC token and no secret is stored. */
function sandboxCreds() {
  const token = process.env.SANDBOX_VERCEL_TOKEN, teamId = process.env.VERCEL_TEAM_ID, projectId = process.env.VERCEL_PROJECT_ID;
  return token && teamId && projectId ? { token, teamId, projectId } : undefined;
}

/**
 * Wires the run service. Returns null when no runner backend is configured: callers answer 503 `runner_unavailable`
 * BEFORE any credit is taken. Real runs need the GitHub App credentials and the runner snapshot (RUNNER_SNAPSHOT_ID).
 */
export async function getRunDeps(db: Db): Promise<RunDeps | null> {
  if (fixturesMode()) {
    const f = fixtureRun();
    return { db, runner: f.runner, host: async () => f.host, gitToken: async () => "fixture-token", appUrl: appUrl() };
  }
  const creds = await loadAppCredentials(db);
  const snapshot = runnerSnapshotId();
  if (!creds || !snapshot) return null;
  const tokens = realTokens(creds);
  const runner = new VercelSandboxRunner({
    driver: createVercelDriver(sandboxCreds()),
    snapshot,
    payload: async () => (await import("./sandbox/agent-payload.generated")).AGENT_FILES.map((f) => ({ path: `${AGENT_DIR}/${f.path}`, content: f.content })),
  });
  return { db, runner, host: tokens.host, gitToken: tokens.gitToken, appUrl: appUrl() };
}

/** Token factories for the real path. */
export function realTokens(creds: { appId: string; privateKeyPem: string }) {
  const spec = (installationId: string, repo: string, permissions: Record<string, "read" | "write">) => ({ ...creds, installationId, repo, permissions });
  return {
    gitToken: (run: { installationId: string; fullName: string }) => mintScopedToken(spec(run.installationId, run.fullName, RUN_TOKEN_PERMISSIONS)),
    host: async (run: { installationId: string; fullName: string }) => createGithubHost(() => mintScopedToken(spec(run.installationId, run.fullName, FINALIZE_TOKEN_PERMISSIONS))),
  };
}

export { fixtureRun };
