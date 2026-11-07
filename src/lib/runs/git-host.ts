import { appJwt } from "@/lib/github/api";

/** The write side of GitHub that a run needs. A fake implements it in tests; GitLab and Bitbucket implement it later. */
export interface GitHost {
  getBase(fullName: string, branch: string): Promise<{ commitSha: string; treeSha: string }>;
  createBranch(fullName: string, branch: string, sha: string): Promise<void>;
  /** commit that reuses a tree (an empty commit when treeSha is the parent's tree) */
  createCommit(fullName: string, input: { message: string; treeSha: string; parentSha: string }): Promise<string>;
  moveBranch(fullName: string, branch: string, sha: string): Promise<void>;
  openPr(fullName: string, input: { head: string; base: string; title: string; body: string; draft: boolean }): Promise<{ number: number; url: string }>;
  updatePr(fullName: string, number: number, input: { title?: string; body?: string; draft?: boolean }): Promise<void>;
  branchHead(fullName: string, branch: string): Promise<string | null>;
  createCheckRun(fullName: string, input: { headSha: string; conclusion: "success" | "failure" | "neutral"; title: string; summary: string; text: string }): Promise<number>;
  postReview(fullName: string, number: number, input: { headSha: string; body: string; comments: { path: string; line: number; body: string }[] }): Promise<void>;
}

export const CHECK_NAME = "Stepclimb by BufferSol · Verified";
const API = "https://api.github.com";

export interface TokenSpec { appId: string; privateKeyPem: string; installationId: string; repo: string; permissions: Record<string, "read" | "write"> }

/** Installation token scoped to ONE repository with the minimum permissions (1 hour life, never stored). */
export async function mintScopedToken(t: TokenSpec, fetchImpl: typeof fetch = fetch): Promise<string> {
  const res = await fetchImpl(`${API}/app/installations/${t.installationId}/access_tokens`, {
    method: "POST",
    headers: { authorization: `Bearer ${appJwt(t.appId, t.privateKeyPem)}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "stepclimb" },
    body: JSON.stringify({ repositories: [t.repo.split("/")[1]], permissions: t.permissions }),
  });
  if (!res.ok) throw new Error(`installation_token_${res.status}`);
  return ((await res.json()) as { token: string }).token;
}

export const RUN_TOKEN_PERMISSIONS = { contents: "write", metadata: "read" } as const;
export const FINALIZE_TOKEN_PERMISSIONS = { contents: "write", pull_requests: "write", checks: "write", metadata: "read" } as const;

export function createGithubHost(getToken: () => Promise<string>, fetchImpl: typeof fetch = fetch): GitHost {
  async function call<T>(method: string, path: string, body?: unknown, okStatuses: number[] = []): Promise<T | null> {
    const res = await fetchImpl(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${await getToken()}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "stepclimb", ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (okStatuses.includes(res.status)) return null;
    if (!res.ok) throw new Error(`github_${method}_${res.status}`);
    return res.status === 204 ? null : ((await res.json()) as T);
  }
  const repo = (f: string) => `/repos/${f}`;
  return {
    async getBase(f, branch) {
      const ref = await call<{ object: { sha: string } }>("GET", `${repo(f)}/git/ref/heads/${branch.split("/").map(encodeURIComponent).join("/")}`);
      const commit = await call<{ tree: { sha: string } }>("GET", `${repo(f)}/git/commits/${ref!.object.sha}`);
      return { commitSha: ref!.object.sha, treeSha: commit!.tree.sha };
    },
    async createBranch(f, branch, sha) { await call("POST", `${repo(f)}/git/refs`, { ref: `refs/heads/${branch}`, sha }); },
    async createCommit(f, i) { return (await call<{ sha: string }>("POST", `${repo(f)}/git/commits`, { message: i.message, tree: i.treeSha, parents: [i.parentSha] }))!.sha; },
    async moveBranch(f, branch, sha) { await call("PATCH", `${repo(f)}/git/refs/heads/${branch.split("/").map(encodeURIComponent).join("/")}`, { sha, force: false }); },
    async openPr(f, i) {
      const r = await call<{ number: number; html_url: string }>("POST", `${repo(f)}/pulls`, i);
      return { number: r!.number, url: r!.html_url };
    },
    async updatePr(f, n, i) { await call("PATCH", `${repo(f)}/pulls/${n}`, i); },
    async branchHead(f, branch) {
      const r = await call<{ object: { sha: string } }>("GET", `${repo(f)}/git/ref/heads/${branch.split("/").map(encodeURIComponent).join("/")}`, undefined, [404]);
      return r?.object.sha ?? null;
    },
    async createCheckRun(f, i) {
      const r = await call<{ id: number }>("POST", `${repo(f)}/check-runs`, {
        name: CHECK_NAME, head_sha: i.headSha, status: "completed", conclusion: i.conclusion,
        output: { title: i.title, summary: i.summary, text: i.text.slice(0, 60_000) },
      });
      return r!.id;
    },
    async postReview(f, n, i) {
      await call("POST", `${repo(f)}/pulls/${n}/reviews`, { commit_id: i.headSha, body: i.body, event: "COMMENT", comments: i.comments.map((c) => ({ path: c.path, line: c.line, side: "RIGHT", body: c.body })) });
    },
  };
}
