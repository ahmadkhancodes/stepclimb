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

/**
 * Wires the run service. Returns null when no runner backend is configured: callers answer 503 `runner_unavailable`
 * BEFORE any credit is taken. The Vercel Sandbox adapter (`SandboxDriver`) is added with the first real run: docs/MANUAL_STEPS.md.
 */
export async function getRunDeps(db: Db): Promise<RunDeps | null> {
  if (fixturesMode()) {
    const f = fixtureRun();
    return { db, runner: f.runner, host: async () => f.host, gitToken: async () => "fixture-token", appUrl: appUrl() };
  }
  const creds = await loadAppCredentials(db);
  if (!creds) return null;
  // no SandboxDriver adapter yet
  return null;
}

/** Token factories for the real path (used once a driver exists). */
export function realTokens(creds: { appId: string; privateKeyPem: string }) {
  const spec = (installationId: string, repo: string, permissions: Record<string, "read" | "write">) => ({ ...creds, installationId, repo, permissions });
  return {
    gitToken: (run: { installationId: string; fullName: string }) => mintScopedToken(spec(run.installationId, run.fullName, RUN_TOKEN_PERMISSIONS)),
    host: async (run: { installationId: string; fullName: string }) => createGithubHost(() => mintScopedToken(spec(run.installationId, run.fullName, FINALIZE_TOKEN_PERMISSIONS))),
  };
}

export { fixtureRun };
