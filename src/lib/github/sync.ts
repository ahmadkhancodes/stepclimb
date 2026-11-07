import type { Db } from "@/lib/db";
import type { GithubApi, GithubRepoInfo } from "./api";

export interface InstallationDoc {
  provider: "github";
  externalId: string;
  accountLogin: string;
  accountType: string;
  accountId: string | null;
  suspendedAt: Date | null;
  repoSelection: string;
  updatedAt: Date;
}
export interface RepoDoc {
  installationId: string;
  accountId: string | null;
  externalId: number;
  fullName: string;
  defaultBranch: string;
  private: boolean;
  archived: boolean;
  pushedAt: string | null;
  updatedAt: Date;
  /** autopilot settings (repo settings page); all optional so synced repos stay valid */
  autopilotWeekly?: boolean;
  /** IANA zone for the Monday 06:00 window; default America/New_York */
  timezone?: string;
  quietMode?: boolean;
}

export const repoDocId = (installationId: string, fullName: string) => `${installationId}:${fullName}`;

interface InstallationPayload {
  action?: string;
  installation?: { id: number; account?: { login?: string; type?: string }; repository_selection?: string; suspended_at?: string | null };
  repositories?: { id: number; full_name: string; private?: boolean }[];
  repositories_added?: { id: number; full_name: string; private?: boolean }[];
  repositories_removed?: { id: number; full_name: string }[];
}

async function putInstallation(db: Db, p: InstallationPayload, suspended: boolean | null) {
  const i = p.installation;
  if (!i) return null;
  const id = String(i.id);
  const prev = await db.docs.get<InstallationDoc>("installations", id);
  await db.docs.put("installations", id, {
    provider: "github",
    externalId: id,
    accountLogin: i.account?.login ?? prev?.accountLogin ?? "",
    accountType: i.account?.type ?? prev?.accountType ?? "User",
    accountId: prev?.accountId ?? null,
    repoSelection: i.repository_selection ?? prev?.repoSelection ?? "selected",
    suspendedAt: suspended === null ? (prev?.suspendedAt ?? null) : suspended ? new Date() : null,
    updatedAt: new Date(),
  } satisfies InstallationDoc);
  return id;
}

async function putRepo(db: Db, installationId: string, accountId: string | null, r: Partial<GithubRepoInfo> & { id: number; fullName: string }) {
  const prev = await db.docs.get<RepoDoc>("repos", repoDocId(installationId, r.fullName));
  await db.docs.put("repos", repoDocId(installationId, r.fullName), {
    installationId,
    accountId: prev?.accountId ?? accountId,
    externalId: r.id,
    fullName: r.fullName,
    defaultBranch: r.defaultBranch ?? prev?.defaultBranch ?? "main",
    private: r.private ?? prev?.private ?? true,
    archived: r.archived ?? prev?.archived ?? false,
    pushedAt: r.pushedAt ?? prev?.pushedAt ?? null,
    updatedAt: new Date(),
  } satisfies RepoDoc);
}

async function removeRepos(db: Db, installationId: string, fullNames: string[]) {
  for (const fullName of fullNames) {
    const id = repoDocId(installationId, fullName);
    await db.docs.remove("apps", { repoId: id });
    await db.docs.remove("scans", { repoId: id });
    await db.docs.remove("repos", { installationId, fullName });
  }
}

/** Applies `installation` and `installation_repositories` events. Returns the installation id and whether a full sync should follow. */
export async function applyGithubEvent(db: Db, event: string, p: InstallationPayload): Promise<{ installationId: string; needsSync: boolean } | null> {
  if (event === "installation") {
    const action = p.action;
    if (action === "deleted") {
      const id = String(p.installation?.id ?? "");
      if (!id) return null;
      const repos = await db.docs.find<RepoDoc>("repos", { installationId: id });
      await removeRepos(db, id, repos.map((r) => r.fullName));
      await db.docs.remove("installations", { externalId: id });
      return { installationId: id, needsSync: false };
    }
    const id = await putInstallation(db, p, action === "suspend" ? true : action === "unsuspend" ? false : null);
    if (!id) return null;
    const inst = await db.docs.get<InstallationDoc>("installations", id);
    for (const r of p.repositories ?? []) await putRepo(db, id, inst?.accountId ?? null, { id: r.id, fullName: r.full_name, private: r.private });
    return { installationId: id, needsSync: action === "created" || action === "unsuspend" || action === "new_permissions_accepted" };
  }
  if (event === "installation_repositories") {
    const id = await putInstallation(db, p, null);
    if (!id) return null;
    const inst = await db.docs.get<InstallationDoc>("installations", id);
    for (const r of p.repositories_added ?? []) await putRepo(db, id, inst?.accountId ?? null, { id: r.id, fullName: r.full_name, private: r.private });
    await removeRepos(db, id, (p.repositories_removed ?? []).map((r) => r.full_name));
    return { installationId: id, needsSync: (p.repositories_added?.length ?? 0) > 0 };
  }
  return null;
}

/** Full repository sync for one installation: upsert what GitHub lists, drop what it no longer lists. */
export async function syncInstallation(db: Db, api: GithubApi, installationId: string): Promise<{ added: number; removed: number; total: number }> {
  const inst = await db.docs.get<InstallationDoc>("installations", installationId);
  const listed = await api.listInstallationRepos(installationId);
  const before = await db.docs.find<RepoDoc>("repos", { installationId });
  const known = new Set(before.map((r) => r.fullName));
  for (const r of listed) await putRepo(db, installationId, inst?.accountId ?? null, r);
  const live = new Set(listed.map((r) => r.fullName));
  const gone = before.filter((r) => !live.has(r.fullName)).map((r) => r.fullName);
  await removeRepos(db, installationId, gone);
  return { added: listed.filter((r) => !known.has(r.fullName)).length, removed: gone.length, total: listed.length };
}

/**
 * Links unclaimed installations to an org. Only with proof that the signed in person can see the installation on GitHub:
 *  - a personal installation whose account login equals the user's GitHub login (from GitHub sign in, never user input), or
 *  - an installation id listed by GitHub for the user's own OAuth token (`GET /user/installations`), passed in as `visibleIds`.
 * The setup redirect's `installation_id` is NOT proof on its own: GitHub does not sign it and ids are sequential, so anyone
 * could claim a stranger's fresh install (and with it their private repos) by guessing the next id.
 */
export async function claimInstallations(db: Db, orgId: string, opts: { installationId?: string; githubLogin?: string | null; visibleIds?: string[] | null }): Promise<string[]> {
  const byId = new Map<string, InstallationDoc & { id: string }>();
  const login = opts.githubLogin?.toLowerCase() ?? null;
  const visible = new Set(opts.visibleIds ?? []);
  if (opts.installationId) {
    const one = await db.docs.get<InstallationDoc>("installations", opts.installationId);
    if (one && (visible.has(one.id) || (login && one.accountType === "User" && one.accountLogin.toLowerCase() === login))) byId.set(one.id, one);
  }
  for (const id of visible) {
    const one = await db.docs.get<InstallationDoc>("installations", id);
    if (one) byId.set(one.id, one);
  }
  if (opts.githubLogin) {
    for (const i of await db.docs.find<InstallationDoc>("installations", { accountLogin: opts.githubLogin, accountId: null })) if (i.accountType === "User") byId.set(i.id, i);
  }
  const claimed: string[] = [];
  for (const inst of byId.values()) {
    if (inst.accountId) continue;
    await db.docs.put("installations", inst.id, { accountId: orgId });
    for (const r of await db.docs.find<RepoDoc>("repos", { installationId: inst.id })) await db.docs.put("repos", r.id, { accountId: orgId });
    claimed.push(inst.id);
  }
  return claimed;
}

/** Installation ids of THIS app that the user's GitHub OAuth token can access (user-to-server token from GitHub sign in). */
export async function userInstallationIds(userToken: string, fetchImpl: typeof fetch = fetch): Promise<string[]> {
  const ids: string[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await fetchImpl(`https://api.github.com/user/installations?per_page=100&page=${page}`, { headers: { authorization: `Bearer ${userToken}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "stepclimb" } });
    if (!res.ok) throw new Error(`user_installations_${res.status}`);
    const j = (await res.json()) as { installations?: { id: number }[] };
    for (const i of j.installations ?? []) ids.push(String(i.id));
    if ((j.installations ?? []).length < 100) break;
  }
  return ids;
}
