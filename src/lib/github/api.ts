import { createSign } from "node:crypto";

/** What the scan and sync code needs from GitHub. The real client and the fixture client both implement it. */
export interface GithubRepoInfo {
  id: number;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  archived: boolean;
  pushedAt: string | null;
}
export interface GithubApi {
  listInstallationRepos(installationId: string): Promise<GithubRepoInfo[]>;
  /** All file paths in the default branch tree (no contents). */
  listTree(installationId: string, fullName: string, ref: string): Promise<string[]>;
  /** File text or null when it does not exist. */
  getFile(installationId: string, fullName: string, path: string, ref: string): Promise<string | null>;
}

const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** RS256 app JWT (10 min). Uses node:crypto, which accepts GitHub's PKCS#1 PEM directly. */
export function appJwt(appId: string, pem: string, now = Math.floor(Date.now() / 1000)): string {
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64u(JSON.stringify({ iat: now - 30, exp: now + 540, iss: appId }));
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(pem);
  return `${head}.${body}.${b64u(sig)}`;
}

const API = "https://api.github.com";

export function createGithubApi(creds: { appId: string; privateKeyPem: string }, fetchImpl: typeof fetch = fetch): GithubApi {
  const tokens = new Map<string, { token: string; exp: number }>();
  const headers = (auth: string) => ({ authorization: auth, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "stepclimb" });

  async function token(installationId: string): Promise<string> {
    const hit = tokens.get(installationId);
    if (hit && hit.exp > Date.now() + 60_000) return hit.token;
    const res = await fetchImpl(`${API}/app/installations/${installationId}/access_tokens`, {
      method: "POST",
      headers: headers(`Bearer ${appJwt(creds.appId, creds.privateKeyPem)}`),
      // read only: scanning never needs write access
      body: JSON.stringify({ permissions: { contents: "read", metadata: "read" } }),
    });
    if (!res.ok) throw new Error(`installation_token_${res.status}`);
    const j = (await res.json()) as { token: string; expires_at: string };
    tokens.set(installationId, { token: j.token, exp: Date.parse(j.expires_at) });
    return j.token;
  }
  const get = async (installationId: string, url: string) => fetchImpl(url, { headers: headers(`Bearer ${await token(installationId)}`) });
  const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");

  return {
    async listInstallationRepos(installationId) {
      const out: GithubRepoInfo[] = [];
      for (let page = 1; page <= 10; page++) {
        const res = await get(installationId, `${API}/installation/repositories?per_page=100&page=${page}`);
        if (!res.ok) throw new Error(`list_repos_${res.status}`);
        const j = (await res.json()) as { repositories: { id: number; full_name: string; default_branch: string; private: boolean; archived: boolean; pushed_at: string | null }[] };
        for (const r of j.repositories) out.push({ id: r.id, fullName: r.full_name, defaultBranch: r.default_branch, private: r.private, archived: r.archived, pushedAt: r.pushed_at });
        if (j.repositories.length < 100) break;
      }
      return out;
    },
    async listTree(installationId, fullName, ref) {
      const res = await get(installationId, `${API}/repos/${fullName}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
      if (res.status === 404 || res.status === 409) return [];
      if (!res.ok) throw new Error(`tree_${res.status}`);
      const j = (await res.json()) as { tree: { path: string; type: string }[] };
      return j.tree.filter((t) => t.type === "blob").map((t) => t.path);
    },
    async getFile(installationId, fullName, path, ref) {
      // raw media type: works past the 1 MB JSON limit (composer.lock is often larger)
      const res = await fetchImpl(`${API}/repos/${fullName}/contents/${enc(path)}?ref=${encodeURIComponent(ref)}`, {
        headers: { ...headers(`Bearer ${await token(installationId)}`), accept: "application/vnd.github.raw+json" },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`contents_${res.status}`);
      return res.text();
    },
  };
}
