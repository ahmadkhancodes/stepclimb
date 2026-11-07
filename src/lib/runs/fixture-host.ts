import type { GitHost } from "./git-host";

export interface FixtureHostCalls {
  branches: { fullName: string; branch: string; sha: string }[];
  commits: { fullName: string; message: string; treeSha: string; parentSha: string; sha: string }[];
  prs: { fullName: string; number: number; head: string; base: string; title: string; body: string; draft: boolean }[];
  checks: { fullName: string; headSha: string; conclusion: string; title: string; summary: string }[];
  updates: { fullName: string; number: number; title?: string; body?: string }[];
  states: Record<string, "open" | "closed" | "merged">;
  reviews: { fullName: string; number: number; comments: number }[];
}

/** Recording GitHost with no network: fixture e2e (GITHUB_FIXTURES=1) and unit tests. */
export function createFixtureHost(): GitHost & { calls: FixtureHostCalls } {
  const calls: FixtureHostCalls = { branches: [], commits: [], prs: [], checks: [], reviews: [], updates: [], states: {} };
  const heads = new Map<string, string>();
  let n = 0;
  const key = (f: string, b: string) => `${f}#${b}`;
  return {
    calls,
    async getBase(f, branch) {
      const commitSha = heads.get(key(f, branch)) ?? "basecommit0001";
      heads.set(key(f, branch), commitSha);
      return { commitSha, treeSha: "basetree0001" };
    },
    async createBranch(f, branch, sha) { calls.branches.push({ fullName: f, branch, sha }); heads.set(key(f, branch), sha); },
    async createCommit(f, i) { const sha = `commit${String(++n).padStart(4, "0")}`; calls.commits.push({ fullName: f, ...i, sha }); return sha; },
    async moveBranch(f, branch, sha) { heads.set(key(f, branch), sha); },
    async openPr(f, i) { const number = calls.prs.length + 1; calls.prs.push({ fullName: f, number, ...i }); return { number, url: `https://github.com/${f}/pull/${number}` }; },
    async updatePr(f, number, i) { calls.updates.push({ fullName: f, number, ...(i.title ? { title: i.title } : {}), ...(i.body ? { body: i.body } : {}) }); },
    async prState(f, number) { return calls.states[`${f}#${number}`] ?? (calls.prs.some((p) => p.fullName === f && p.number === number) ? "open" : "unknown"); },
    async branchHead(f, branch) { return heads.get(key(f, branch)) ?? null; },
    async createCheckRun(f, i) { calls.checks.push({ fullName: f, headSha: i.headSha, conclusion: i.conclusion, title: i.title, summary: i.summary }); return calls.checks.length; },
    async postReview(f, number, i) { calls.reviews.push({ fullName: f, number, comments: i.comments.length }); },
  };
}
