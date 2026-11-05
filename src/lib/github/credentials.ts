import { env } from "@/lib/env";

/**
 * GitHub App credentials used for "Sign in with GitHub" (the App's OAuth client).
 * Resolution order: env (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET) now; the encrypted record written by the manifest
 * callback (docs/DECISIONS.md D-05) is added in M2 behind this same function.
 */
export interface GithubOAuthCreds { clientId: string; clientSecret: string }

export async function githubOAuthCreds(): Promise<GithubOAuthCreds | null> {
  const e = env();
  if (e.GITHUB_CLIENT_ID && e.GITHUB_CLIENT_SECRET) return { clientId: e.GITHUB_CLIENT_ID, clientSecret: e.GITHUB_CLIENT_SECRET };
  return null;
}
