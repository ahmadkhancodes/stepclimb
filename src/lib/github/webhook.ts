import { hmacHex } from "@/lib/crypto";
import { safeEqual } from "@/lib/ids";

/** Verifies `X-Hub-Signature-256` (sha256=<hex>) over the raw body, constant time. */
export async function verifySignature(secret: string, rawBody: string | Uint8Array, header: string | null): Promise<boolean> {
  if (!secret || !header || !header.startsWith("sha256=")) return false;
  const expected = await hmacHex(secret, rawBody);
  return safeEqual(header.slice(7).toLowerCase(), expected);
}

import type { Db } from "@/lib/db";
import { handlePullRequestEvent } from "@/lib/autopilot/state";
import { applyGithubEvent } from "./sync";

export interface WebhookInput { secret: string; raw: string; signature: string | null; event: string | null; delivery: string | null }
export type WebhookResult =
  | { status: 401 | 400; body: { error: string } }
  | { status: 200; body: { ok: true; duplicate?: boolean; ignored?: boolean }; syncInstallationId?: string };

const EVENT_TTL_MS = 30 * 86_400_000;

/** Verify, dedupe by delivery id, apply. The delivery is recorded only after a successful apply (kit rule). */
export async function processWebhook(db: Db, i: WebhookInput): Promise<WebhookResult> {
  if (!(await verifySignature(i.secret, i.raw, i.signature))) return { status: 401, body: { error: "bad_signature" } };
  if (!i.event || !i.delivery) return { status: 400, body: { error: "missing_headers" } };
  const key = `github:${i.delivery}`;
  if (await db.docs.get("webhook_events", key)) return { status: 200, body: { ok: true, duplicate: true } };
  let payload: unknown;
  try { payload = JSON.parse(i.raw); } catch { return { status: 400, body: { error: "bad_json" } }; }
  if (i.event === "pull_request") {
    // closing our autopilot PR feeds the quiet mode suggestion; nothing else to apply
    const handled = await handlePullRequestEvent(db, payload as never);
    await db.docs.insert("webhook_events", key, { provider: "github", eventId: i.delivery, event: i.event, processedAt: new Date(), expireAt: new Date(Date.now() + EVENT_TTL_MS) });
    return { status: 200, body: { ok: true, ...(handled ? {} : { ignored: true }) } };
  }
  const applied = await applyGithubEvent(db, i.event, payload as never);
  await db.docs.insert("webhook_events", key, { provider: "github", eventId: i.delivery, event: i.event, processedAt: new Date(), expireAt: new Date(Date.now() + EVENT_TTL_MS) });
  if (!applied) return { status: 200, body: { ok: true, ignored: true } };
  return { status: 200, body: { ok: true }, ...(applied.needsSync ? { syncInstallationId: applied.installationId } : {}) };
}
