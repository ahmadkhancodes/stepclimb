import { getDb } from "@/lib/db";
import { DELIVERY_TTL_DAYS, type Db, type WebhookDelivery, type WebhookEndpoint } from "@/lib/db/types";
import { hmacSha256Hex, randomToken, uuidv7 } from "@/lib/ids";
import { product } from "@/config/product";
import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

// Outbound webhooks: HMAC-SHA256 signed (Stripe-style header), retries with exponential backoff, delivery log.
// Header: `X-Webhook-Signature: t=<unix>,v1=<hex hmac of "t.body">`, plus X-Webhook-Id / X-Webhook-Event.

export const MAX_ATTEMPTS = 8;
/** Backoff after attempt n (1-based): 30s, 2m, 10m, 30m, 1h, 3h, 6h, 12h (+-10% jitter). */
const BACKOFF_S = [30, 120, 600, 1800, 3600, 10800, 21600, 43200];
export function backoffMs(attempt: number, rand = Math.random): number {
  const base = BACKOFF_S[Math.min(attempt - 1, BACKOFF_S.length - 1)]! * 1000;
  return Math.round(base * (0.9 + rand() * 0.2));
}

export const newWebhookSecret = () => `whsec_${randomToken(24)}`;

export async function signPayload(secret: string, body: string, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${await hmacSha256Hex(secret, `${t}.${body}`)}`;
}

/** For receivers and tests: verify a signature header with a 5 minute tolerance. */
export async function verifySignature(secret: string, body: string, header: string, now = Date.now(), toleranceS = 300) {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(now / 1000 - t) > toleranceS) return false;
  return parts.v1 === (await hmacSha256Hex(secret, `${t}.${body}`));
}

/** Queue an event to every enabled endpoint subscribed to it (or to "*"), and try once immediately. */
export async function emitEvent(orgId: string, event: string, data: unknown, opts: { db?: Db; fetchFn?: typeof fetch; now?: Date } = {}) {
  const db = opts.db ?? (await getDb());
  const now = opts.now ?? new Date();
  const eps = (await db.listWebhookEndpoints(orgId)).filter((e) => e.enabled && (e.events.includes("*") || e.events.includes(event)));
  const out: WebhookDelivery[] = [];
  for (const ep of eps) {
    const id = uuidv7();
    const payload = JSON.stringify({ id, type: event, created: Math.floor(now.getTime() / 1000), data });
    const d: WebhookDelivery = {
      id, app: db.app, orgId, endpointId: ep.id, event, payload, status: "pending", attempts: 0,
      nextAttemptAt: now, lastStatusCode: null, lastError: null, createdAt: now, updatedAt: now,
      expireAt: new Date(now.getTime() + DELIVERY_TTL_DAYS * 864e5),
    };
    await db.createDelivery(d);
    out.push(await attemptDelivery(d, ep, { db, fetchFn: opts.fetchFn, now }));
  }
  return out;
}

export async function attemptDelivery(
  d: WebhookDelivery,
  ep: WebhookEndpoint,
  opts: { db: Db; fetchFn?: typeof fetch; lookupFn?: LookupFn; now?: Date },
): Promise<WebhookDelivery> {
  const now = opts.now ?? new Date();
  const attempts = d.attempts + 1;
  let code: number | null = null;
  let error: string | null = null;
  const headers = {
    "content-type": "application/json",
    "user-agent": `${product.name}-Webhooks/1.0`,
    "x-webhook-id": d.id,
    "x-webhook-event": d.event,
    "x-webhook-signature": await signPayload(ep.secret, d.payload, Math.floor(now.getTime() / 1000)),
  };
  try {
    // checked at every attempt, not only when saved: an endpoint stored under older rules is never fetched
    if (!isSafeWebhookUrl(ep.url)) throw new Error("unsafe_target");
    code = opts.fetchFn
      ? (await opts.fetchFn(ep.url, { method: "POST", signal: AbortSignal.timeout(10_000), redirect: "manual", headers, body: d.payload })).status
      : await safePost(ep.url, { headers, body: d.payload, timeoutMs: 10_000, lookupFn: opts.lookupFn });
    if (code < 200 || code >= 300) error = `http_${code}`;
  } catch (e) {
    const m = (e as Error).message;
    error = m === "unsafe_target" ? "unsafe_target" : (e as Error).name === "TimeoutError" || m === "timeout" ? "timeout" : "network_error";
  }
  const ok = !error;
  const patch: Partial<WebhookDelivery> = {
    attempts,
    lastStatusCode: code,
    lastError: error,
    updatedAt: now,
    status: ok ? "succeeded" : attempts >= MAX_ATTEMPTS ? "failed" : "retrying",
    nextAttemptAt: ok || attempts >= MAX_ATTEMPTS ? null : new Date(now.getTime() + backoffMs(attempts)),
  };
  await opts.db.updateDelivery(d.id, patch);
  return { ...d, ...patch };
}

/** Cron job: retry due deliveries. */
export async function retryDueDeliveries(opts: { db?: Db; fetchFn?: typeof fetch; now?: Date; limit?: number } = {}) {
  const db = opts.db ?? (await getDb());
  const now = opts.now ?? new Date();
  const due = await db.dueDeliveries(now, opts.limit ?? 50);
  let ok = 0;
  for (const d of due) {
    const ep = await db.getWebhookEndpoint(d.orgId, d.endpointId);
    if (!ep || !ep.enabled) {
      await db.updateDelivery(d.id, { status: "failed", lastError: "endpoint_disabled", nextAttemptAt: null, updatedAt: now });
      continue;
    }
    const r = await attemptDelivery(d, ep, { db, fetchFn: opts.fetchFn, now });
    if (r.status === "succeeded") ok++;
  }
  return { processed: due.length, succeeded: ok };
}

// ---------- SSRF guard ----------
// A webhook URL is user input that our server fetches. Three layers: the URL is checked when it is saved, checked again at
// every delivery (rules may have tightened since), and the socket only ever connects to an address that passed the check
// (the DNS answer is validated inside the connection's own lookup, so DNS rebinding between check and connect cannot win).
// Redirects are never followed and the response body is never read.

const V4_BLOCKED: [number, number][] = [
  [0x00000000, 8], [0x0a000000, 8], [0x64400000, 10], [0x7f000000, 8], [0xa9fe0000, 16], [0xac100000, 12], [0xc0000000, 24],
  [0xc0000200, 24], [0xc0a80000, 16], [0xc6120000, 15], [0xc6336400, 24], [0xcb007100, 24], [0xe0000000, 4], [0xf0000000, 4],
];
const v4ToInt = (ip: string) => ip.split(".").reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;

/** Private, loopback, link-local, CGNAT, documentation, multicast and reserved addresses (v4 and v6, incl. v4-mapped). */
export function isPrivateAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const n = v4ToInt(ip);
    return V4_BLOCKED.some(([base, bits]) => (n >>> (32 - bits)) === (base >>> (32 - bits)));
  }
  if (kind !== 6) return true;
  const a = ip.toLowerCase();
  const mapped = /^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a) ?? /^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (mapped) return isPrivateAddress(mapped[1]!);
  if (/^(?:0*:)*:?ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(a) || a.startsWith("64:ff9b:")) return true; // mapped / NAT64 in hex form
  if (a === "::" || a === "::1" || /^0*:(?:0*:)*0*1?$/.test(a)) return true;
  const head = parseInt(a.split(":")[0] || "0", 16);
  return (head & 0xfe00) === 0xfc00 || (head & 0xffc0) === 0xfe80 || (head & 0xff00) === 0xff00 || head === 0x2002 || a.startsWith("2001:db8:") || a.startsWith("2001:0db8:");
}

const BLOCKED_SUFFIXES = [".localhost", ".internal", ".local", ".home.arpa", ".localdomain", ".lan", ".intranet", ".corp"];

/** Block private/loopback targets (SSRF) for user-supplied webhook URLs. */
export function isSafeWebhookUrl(raw: string): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && u.protocol === "http:")) return false;
  if (u.username || u.password) return false;
  // trailing dots (`localhost.`) resolve like the name without them
  const h = u.hostname.toLowerCase().replace(/\.+$/, "").replace(/^\[|\]$/g, "");
  if (!h) return false;
  if (isIP(h)) return !isPrivateAddress(h);
  if (h === "localhost" || !h.includes(".") || BLOCKED_SUFFIXES.some((x) => h.endsWith(x))) return false;
  return true;
}

export type LookupFn = (host: string) => Promise<{ address: string; family: number }[]>;
const systemLookup: LookupFn = (host) => dnsLookup(host, { all: true, verbatim: true });

/**
 * POST without following redirects, connecting only to public addresses. Returns the status code; the body is discarded.
 * Throws Error("unsafe_target") when the name resolves to any private address, Error("timeout") after `timeoutMs`.
 */
export function safePost(raw: string, init: { headers: Record<string, string>; body: string; timeoutMs?: number; lookupFn?: LookupFn }): Promise<number> {
  if (!isSafeWebhookUrl(raw)) return Promise.reject(new Error("unsafe_target"));
  const u = new URL(raw);
  const resolve = init.lookupFn ?? systemLookup;
  const lookup = (host: string, _o: unknown, cb: (err: Error | null, address?: string | { address: string; family: number }[], family?: number) => void) => {
    const bare = host.replace(/^\[|\]$/g, "");
    const p = isIP(bare) ? Promise.resolve([{ address: bare, family: isIP(bare) }]) : resolve(bare);
    p.then((all) => {
      if (!all.length || all.some((a) => isPrivateAddress(a.address))) return cb(Object.assign(new Error("unsafe_target"), { code: "EUNSAFE" }));
      const opts = _o as { all?: boolean };
      if (opts?.all) cb(null, all);
      else cb(null, all[0]!.address, all[0]!.family);
    }, (e: Error) => cb(e));
  };
  const mod = u.protocol === "https:" ? https : http;
  return new Promise<number>((done, fail) => {
    const req = mod.request(u, { method: "POST", headers: { ...init.headers, "content-length": Buffer.byteLength(init.body).toString() }, lookup: lookup as never, timeout: init.timeoutMs ?? 10_000 }, (res) => {
      done(res.statusCode ?? 0);
      res.destroy();
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e: Error & { code?: string }) => fail(e.code === "EUNSAFE" || e.message === "unsafe_target" ? new Error("unsafe_target") : e.message === "timeout" ? new Error("timeout") : e));
    req.end(init.body);
  });
}
