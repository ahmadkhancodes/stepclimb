import type { Db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { appJwt, createGithubApi } from "./api";
import { loadAppCredentials } from "./app-store";
import { syncInstallation, upsertInstallation, type InstallationDoc } from "./sync";

const API = "https://api.github.com";
const h = (jwt: string) => ({ authorization: `Bearer ${jwt}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "stepclimb" });

export interface ReconcileReport {
  installations: number;
  newInstallations: string[];
  reposAdded: number;
  failedDeliveries: number;
  deliveries: { event: string; action: string | null; status: string; code: number; at: string }[];
}

/**
 * Self healing: asks GitHub (App JWT, stored credentials) which installations exist and upserts the missing installation and
 * repo rows, so a lost `installation` webhook never leaves an install invisible. Also records a NON SECRET summary of recent
 * webhook deliveries (event, status code, time; never payloads) in the audit log, which is how a failing endpoint is spotted.
 * Linking an installation to an account still needs the user's own proof (D-37): this only fills the unclaimed rows.
 */
export async function reconcileInstallations(db: Db, fetchImpl: typeof fetch = fetch): Promise<ReconcileReport | { skipped: string }> {
  const creds = await loadAppCredentials(db);
  if (!creds) return { skipped: "no_app_credentials" };
  const jwt = appJwt(creds.appId, creds.privateKeyPem);
  const rep: ReconcileReport = { installations: 0, newInstallations: [], reposAdded: 0, failedDeliveries: 0, deliveries: [] };

  const live: { id: number; account?: { login?: string; type?: string }; repository_selection?: string; suspended_at?: string | null }[] = [];
  for (let page = 1; page <= 10; page++) {
    const res = await fetchImpl(`${API}/app/installations?per_page=100&page=${page}`, { headers: h(jwt) });
    if (!res.ok) throw new Error(`app_installations_${res.status}`);
    const rows = (await res.json()) as typeof live;
    live.push(...rows);
    if (rows.length < 100) break;
  }
  rep.installations = live.length;
  const api = createGithubApi(creds, fetchImpl);
  for (const i of live) {
    const id = String(i.id);
    const known = await db.docs.get<InstallationDoc>("installations", id);
    if (!known) rep.newInstallations.push(id);
    await upsertInstallation(db, i);
    if (i.suspended_at) continue;
    try { rep.reposAdded += (await syncInstallation(db, api, id)).added; } catch { /* one broken installation must not hide the others */ }
  }
  // installations GitHub no longer lists are gone (the `deleted` webhook was lost): drop them with their repos
  const liveIds = new Set(live.map((i) => String(i.id)));
  for (const d of await db.docs.find<InstallationDoc & { id: string }>("installations")) {
    if (liveIds.has(d.id)) continue;
    for (const r of await db.docs.find<{ id: string; fullName: string }>("repos", { installationId: d.id })) {
      await db.docs.remove("apps", { repoId: r.id });
      await db.docs.remove("scans", { repoId: r.id });
      await db.docs.remove("repos", { installationId: d.id, fullName: r.fullName });
    }
    await db.docs.remove("installations", { externalId: d.id });
  }

  try {
    const res = await fetchImpl(`${API}/app/hook/deliveries?per_page=30`, { headers: h(jwt) });
    if (res.ok) {
      for (const d of (await res.json()) as { event: string; action: string | null; status: string; status_code: number; delivered_at: string }[]) {
        rep.deliveries.push({ event: d.event, action: d.action, status: d.status, code: d.status_code, at: d.delivered_at });
        if (d.status_code >= 300 || d.status_code === 0) rep.failedDeliveries++;
      }
    }
  } catch { /* the summary is a diagnostic, not part of the sync */ }

  await audit({
    orgId: null, actorId: null, action: "github.reconcile", target: "github_app",
    meta: { installations: rep.installations, newInstallations: rep.newInstallations.join(",").slice(0, 200), reposAdded: rep.reposAdded, failedDeliveries: rep.failedDeliveries, deliveries: JSON.stringify(rep.deliveries.slice(0, 15)).slice(0, 1800) },
  });
  return rep;
}

/** First request after a deploy (health check): at most one reconcile per 10 minutes overall (a doc in `ops`). Failures are recorded, not swallowed. */
export async function reconcileOnce(db: Db): Promise<void> {
  try {
    const last = await db.docs.get<{ at: number }>("ops", "reconcile_last");
    if (last && Date.now() - last.at < 10 * 60_000) return;
    await db.docs.put("ops", "reconcile_last", { at: Date.now() });
    await reconcileInstallations(db);
  } catch (e) {
    await audit({ orgId: null, actorId: null, action: "github.reconcile_failed", target: "github_app", meta: { error: String((e as Error).message).replace(/[A-Za-z0-9_\-]{32,}/g, "[redacted]").slice(0, 200) } }).catch(() => undefined);
  }
}
