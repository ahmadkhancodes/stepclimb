import { uuidv7 } from "@/lib/ids";
import { log } from "@/lib/logger";
import type { MailMessage, MailTransport, SendResult } from "./types";

/** Dev/test/stub transport: keeps messages in memory and logs the subject (never the body). */
// process wide (globalThis): Next can load this module once per route bundle, and the e2e outbox route must see every message
type OutboxItem = MailMessage & { from: string; id: string; at: Date };
export const outbox: OutboxItem[] = ((globalThis as unknown as { __stepclimbOutbox?: OutboxItem[] }).__stepclimbOutbox ??= []);

export function consoleTransport(): MailTransport {
  return {
    name: "console",
    async send(msg) {
      const id = uuidv7();
      outbox.push({ ...msg, id, at: new Date() });
      if (outbox.length > 200) outbox.shift();
      log.info("mail_console", { subject: msg.subject, id });
      // Stub mode only (no mail provider yet): MAIL_CONSOLE_PRINT=1 prints the body so magic links can be used from logs.
      if ((process.env.NODE_ENV === "development" || process.env.MAIL_CONSOLE_PRINT === "1") && process.env.NODE_ENV !== "test")
        console.log(`\n--- mail ${id} ---\n${msg.text}\n---\n`);
      return { id, provider: "console", accepted: true };
    },
  };
}

const GATEWAY_RETRY = new Set([429, 502, 503]);

/**
 * BufferSol mail gateway (POST {url}/v1/send, Bearer key). No `from` is sent: the gateway forces this app's own From.
 * record "metadata" keeps OTP / reset bodies out of the gateway log. One Idempotency-Key is reused across retries,
 * so a retry after a timeout that did reach the gateway never double-sends. List-Unsubscribe headers/tags are not part of the contract.
 */
export function gatewayTransport(
  url: string,
  key: string,
  opts: { fetchFn?: typeof fetch; timeoutMs?: number; attempts?: number } = {},
): MailTransport {
  const { fetchFn = fetch, timeoutMs = 8_000, attempts = 2 } = opts;
  return {
    name: "gateway",
    async send(msg): Promise<SendResult> {
      const idem = `sc-${uuidv7()}`;
      const body = JSON.stringify({
        to: msg.to, subject: msg.subject, text: msg.text, html: msg.html, replyTo: msg.replyTo,
        record: "metadata", category: msg.category === "marketing" ? "marketing" : "transactional",
      });
      let lastStatus = 0;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
          const res = await fetchFn(`${url.replace(/\/+$/, "")}/v1/send`, {
            method: "POST",
            headers: { authorization: `Bearer ${key}`, "content-type": "application/json", "idempotency-key": idem },
            body,
            signal: ctrl.signal,
          });
          if (res.ok) {
            const j = (await res.json().catch(() => ({}))) as { id?: string; messageId?: string };
            return { id: j.id ?? j.messageId ?? uuidv7(), provider: "gateway", accepted: true };
          }
          lastStatus = res.status;
          if (!GATEWAY_RETRY.has(res.status)) break;
        } catch {
          lastStatus = 0; // timeout / network: retry with the same idempotency key
        } finally {
          clearTimeout(timer);
        }
        if (attempt < attempts) await new Promise((r) => setTimeout(r, 300));
      }
      throw new Error(`mail_gateway_failed_${lastStatus}`);
    },
  };
}

/** Transactional provider adapter (Resend REST over fetch, no SDK). */
export function resendTransport(apiKey: string, fetchFn: typeof fetch = fetch): MailTransport {
  return {
    name: "resend",
    async send(msg): Promise<SendResult> {
      const res = await fetchFn("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          from: msg.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html,
          reply_to: msg.replyTo, headers: msg.headers,
          tags: msg.tags ? Object.entries(msg.tags).map(([name, value]) => ({ name, value })) : undefined,
        }),
      });
      if (!res.ok) throw new Error(`mail_send_failed_${res.status}`);
      const body = (await res.json().catch(() => ({}))) as { id?: string };
      return { id: body.id ?? uuidv7(), provider: "resend", accepted: true };
    },
  };
}

/**
 * SMTP adapter stub for the VPS (own Postfix/KumoMTA). Implement with nodemailer when the VPS exists;
 * the interface stays the same so no caller changes.
 */
export function smtpTransport(): MailTransport {
  return {
    name: "smtp",
    async send() {
      throw new Error("smtp_transport_not_configured");
    },
  };
}
