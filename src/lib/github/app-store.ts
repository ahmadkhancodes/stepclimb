import type { Db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

/** Credentials returned by POST /app-manifests/{code}/conversions (the fields we keep). */
export interface ManifestConversion {
  id: number;
  slug: string;
  name: string;
  html_url: string;
  client_id: string;
  client_secret: string;
  webhook_secret: string;
  pem: string;
}

export interface GithubAppCreds {
  appId: string;
  slug: string;
  name: string;
  htmlUrl: string;
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
  privateKeyPem: string;
}

const COLL = "github_app";
const ID = "primary";

/** Encrypted at rest (D-05). Returns false when credentials already exist (one time setup guard). */
export async function saveAppCredentials(db: Db, c: ManifestConversion, key?: string): Promise<boolean> {
  const enc = (v: string) => encryptSecret(v, key);
  return db.docs.insert(COLL, ID, {
    appId: String(c.id),
    slug: c.slug,
    name: c.name,
    htmlUrl: c.html_url,
    clientIdEnc: await enc(c.client_id),
    clientSecretEnc: await enc(c.client_secret),
    webhookSecretEnc: await enc(c.webhook_secret),
    privateKeyEnc: await enc(c.pem),
    createdAt: new Date(),
  });
}

export async function hasAppCredentials(db: Db): Promise<{ slug: string; htmlUrl: string } | null> {
  const d = await db.docs.get<{ slug: string; htmlUrl: string }>(COLL, ID);
  return d ? { slug: d.slug, htmlUrl: d.htmlUrl } : null;
}

export async function loadAppCredentials(db: Db, key?: string): Promise<GithubAppCreds | null> {
  const d = await db.docs.get<Record<string, string>>(COLL, ID);
  if (!d) return null;
  const dec = (v: string) => decryptSecret(v, key);
  return {
    appId: d.appId!,
    slug: d.slug!,
    name: d.name!,
    htmlUrl: d.htmlUrl!,
    clientId: await dec(d.clientIdEnc!),
    clientSecret: await dec(d.clientSecretEnc!),
    webhookSecret: await dec(d.webhookSecretEnc!),
    privateKeyPem: await dec(d.privateKeyEnc!),
  };
}

/** Exchanges the manifest `code` for credentials (the only network call of the setup flow). */
export async function convertManifestCode(code: string, fetchImpl: typeof fetch = fetch): Promise<ManifestConversion> {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(code)) throw new Error("bad_code");
  const res = await fetchImpl(`https://api.github.com/app-manifests/${code}/conversions`, {
    method: "POST",
    headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "stepclimb" },
  });
  if (!res.ok) throw new Error(`conversion_failed_${res.status}`);
  const j = (await res.json()) as Partial<ManifestConversion>;
  if (!j.id || !j.pem || !j.webhook_secret || !j.client_id || !j.client_secret || !j.slug) throw new Error("conversion_incomplete");
  return j as ManifestConversion;
}
