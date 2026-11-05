import { after } from "next/server";
import { getDb } from "@/lib/db";
import { json } from "@/lib/http";
import { log } from "@/lib/logger";
import { loadAppCredentials } from "@/lib/github/app-store";
import { getGithubApi } from "@/lib/github/client";
import { syncInstallation } from "@/lib/github/sync";
import { processWebhook } from "@/lib/github/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GitHub App webhook. No CSRF/session: authenticity is the HMAC over the raw body (X-Hub-Signature-256). */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 5_000_000) return json({ error: "body_too_large" }, 413);
  const db = await getDb();
  const secret = process.env.GITHUB_FIXTURES === "1" ? (process.env.GITHUB_WEBHOOK_SECRET ?? "") : ((await loadAppCredentials(db))?.webhookSecret ?? "");
  if (!secret) return json({ error: "not_configured" }, 503);
  const r = await processWebhook(db, {
    secret, raw,
    signature: req.headers.get("x-hub-signature-256"),
    event: req.headers.get("x-github-event"),
    delivery: req.headers.get("x-github-delivery"),
  });
  if (r.status === 200 && r.syncInstallationId) {
    const id = r.syncInstallationId;
    after(async () => {
      try {
        const api = await getGithubApi(db);
        if (api) await syncInstallation(db, api, id);
      } catch (e) {
        log.error("github_sync_failed", { route: "github/webhook", message: (e as Error).message });
      }
    });
  }
  return json(r.body, r.status);
}
