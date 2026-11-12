/**
 * Copy-paste snippets shared by the docs pages and the app (API keys page), so the two never disagree.
 * tests/e2e/docs-work.spec.ts runs them against the running app.
 */
export const API_KEY_HEADER = "x-api-key";

/** `curl <base>/api/v1/me -H "x-api-key: <key>"`, the first request to try with a new key. */
export function meCurl(base: string, key = "YOUR_API_KEY"): string {
  return `curl ${base.replace(/\/$/, "")}/api/v1/me \\\n  -H "${API_KEY_HEADER}: ${key}"`;
}
