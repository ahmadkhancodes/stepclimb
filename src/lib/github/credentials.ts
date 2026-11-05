import { env } from "@/lib/env";
import { getDb } from "@/lib/db";
import { loadAppCredentials } from "./app-store";

/**
 * GitHub App credentials used for "Sign in with GitHub" (the App's OAuth client).
 * Resolution order: env (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET), else the encrypted record written by the
 * manifest callback (docs/DECISIONS.md D-05).
 */
export interface GithubOAuthCreds { clientId: string; clientSecret: string }

export async function githubOAuthCreds(): Promise<GithubOAuthCreds | null> {
  const e = env();
  if (e.GITHUB_CLIENT_ID && e.GITHUB_CLIENT_SECRET) return { clientId: e.GITHUB_CLIENT_ID, clientSecret: e.GITHUB_CLIENT_SECRET };
  if (!e.APP_ENCRYPTION_KEY) return null;
  try {
    const c = await loadAppCredentials(await getDb());
    return c ? { clientId: c.clientId, clientSecret: c.clientSecret } : null;
  } catch {
    return null;
  }
}
