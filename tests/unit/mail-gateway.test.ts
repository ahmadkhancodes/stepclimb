import { afterEach, describe, expect, it, vi } from "vitest";
import { gatewayTransport } from "@/lib/mail/transports";
import { transportFromEnv } from "@/lib/mail";

const msg = { to: "a@x.test", subject: "s", text: "t", from: "A <a@x.test>" };
const fx = (fn: (u: string, i: RequestInit) => Promise<Response>) => fn as unknown as typeof fetch;

describe("mail gateway transport", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("posts to /v1/send with bearer, metadata record, transactional, and no from", async () => {
    let url = ""; let init: RequestInit = {};
    const t = gatewayTransport("https://gw.test/", "k_1", { fetchFn: fx(async (u, i) => { url = u; init = i; return new Response(JSON.stringify({ ok: true, id: "g1" })); }) });
    expect((await t.send(msg)).id).toBe("g1");
    expect(url).toBe("https://gw.test/v1/send");
    const h = init.headers as Record<string, string>;
    expect(h.authorization).toBe("Bearer k_1");
    expect(h["idempotency-key"]).toBeTruthy();
    const b = JSON.parse(init.body as string);
    expect(b).toMatchObject({ to: "a@x.test", record: "metadata", category: "transactional" });
    expect("from" in b).toBe(false);
  });

  it("retries 503 with the same idempotency key, then succeeds", async () => {
    const keys: string[] = []; let n = 0;
    const t = gatewayTransport("https://gw.test", "k", { fetchFn: fx(async (_u, i) => { keys.push((i.headers as Record<string, string>)["idempotency-key"]); return n++ ? new Response(JSON.stringify({ id: "g2" })) : new Response("", { status: 503 }); }) });
    expect((await t.send(msg)).id).toBe("g2");
    expect(keys[0]).toBe(keys[1]);
  });

  it("does not retry 401/422 and throws the status", async () => {
    let n = 0;
    const t = gatewayTransport("https://gw.test", "k", { fetchFn: fx(async () => { n++; return new Response("", { status: 422 }); }) });
    await expect(t.send(msg)).rejects.toThrow("mail_gateway_failed_422");
    expect(n).toBe(1);
  });

  it("env: gateway wins, missing key fails loudly, unset URL falls back", () => {
    vi.stubEnv("MAIL_GATEWAY_URL", "https://gw.test");
    vi.stubEnv("MAIL_GATEWAY_KEY", "");
    expect(() => transportFromEnv()).toThrow(/mail_gateway_key_missing/);
    vi.stubEnv("MAIL_GATEWAY_KEY", "k");
    expect(transportFromEnv().name).toBe("gateway");
    vi.stubEnv("MAIL_GATEWAY_URL", "");
    vi.stubEnv("MAIL_PROVIDER", "console");
    expect(transportFromEnv().name).toBe("console");
  });
});
