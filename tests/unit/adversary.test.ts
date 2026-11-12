import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createMemoryDb } from "@/lib/db/memory";
import type { Db } from "@/lib/db/types";
import { clientIp } from "@/lib/http";
import { authPath, guardInvite, guardMagicLink, mailboxKey } from "@/lib/security/magic-link-guard";
import { attemptDelivery, isPrivateAddress, isSafeWebhookUrl, safePost } from "@/lib/webhooks/outbound";
import { can } from "@/lib/auth/roles";
import { isFounderAdmin } from "@/lib/auth/session";
import { createAuth } from "@/lib/auth";

// Exploit-style regressions for docs/SECURITY-REVIEW.md. Each test is the attack; it failed before the fix.

let db: Db;
beforeEach(() => { db = createMemoryDb("stepclimb"); });
const savedEnv = { ...process.env };
afterEach(() => { process.env = { ...savedEnv }; });

describe("SR-1 SSRF through webhook endpoints", () => {
  it("refuses loopback, private, CGNAT, mapped, single label and trailing dot hosts at save time", () => {
    for (const u of [
      "https://localhost./x", "https://LOCALHOST../x", "https://127.0.0.1./x", "https://2130706433/x", "https://0x7f.1/x", "https://017700000001/x",
      "https://[::1]/x", "https://[::ffff:127.0.0.1]/x", "https://[::ffff:a9fe:a9fe]/x", "https://[fd00::1]/x", "https://[fe80::1]/x", "https://[64:ff9b::a9fe:a9fe]/x",
      "https://100.64.0.1/x", "https://198.18.0.1/x", "https://224.0.0.1/x", "https://255.255.255.255/x", "https://0.0.0.0/x",
      "https://metadata.google.internal./x", "https://router/x", "https://printer.lan/x", "https://user:pass@hooks.example.com/x",
    ]) expect(isSafeWebhookUrl(u), u).toBe(false);
    for (const u of ["https://hooks.example.com/in", "https://8.8.8.8/x", "https://[2606:4700::1111]/x"]) expect(isSafeWebhookUrl(u), u).toBe(true);
  });

  it("classifies addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.31.0.1", "192.168.0.1", "169.254.169.254", "100.127.255.255", "::1", "::", "::ffff:10.0.0.1", "fc00::1", "fe80::1", "ff02::1", "nonsense"]) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "172.32.0.1", "100.128.0.1", "2606:4700::1111"]) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it("a public looking name that resolves to this machine (DNS rebinding) never gets a connection", async () => {
    let hits = 0;
    const server = http.createServer((_q, r) => { hits++; r.end("ok"); });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as AddressInfo).port;
    try {
      const rebind = async () => [{ address: "127.0.0.1", family: 4 }];
      await expect(safePost(`http://hooks.example.com:${port}/x`, { headers: {}, body: "{}", lookupFn: rebind })).rejects.toThrow("unsafe_target");
      const mixed = async () => [{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }];
      await expect(safePost(`http://hooks.example.com:${port}/x`, { headers: {}, body: "{}", lookupFn: mixed })).rejects.toThrow("unsafe_target");
      expect(hits).toBe(0);
    } finally { server.close(); }
  });

  it("an endpoint saved before the rules tightened is checked again at delivery and never fetched", async () => {
    const ep = await db.createWebhookEndpoint({ id: "ep1", orgId: "o1", url: "https://localhost./steal", secret: "whsec_1", events: ["*"], enabled: true });
    const now = new Date();
    const d = { id: "d1", app: db.app, orgId: "o1", endpointId: "ep1", event: "x", payload: "{}", status: "pending" as const, attempts: 0, nextAttemptAt: now, lastStatusCode: null, lastError: null, createdAt: now, updatedAt: now, expireAt: now };
    await db.createDelivery(d);
    let called = 0;
    const fetchFn = (async () => { called++; return new Response(""); }) as unknown as typeof fetch;
    const r = await attemptDelivery(d, ep, { db, fetchFn, now });
    expect(called).toBe(0);
    expect(r.lastError).toBe("unsafe_target");
  });
});

describe("SR-2 rate limits keyed on a spoofable IP and on sub-addresses", () => {
  const req = (h: Record<string, string>) => new Request("http://x.test/api/auth/sign-in/magic-link", { method: "POST", headers: h });

  it("off Vercel the client's own x-forwarded-for entry is ignored; the proxy's appended entry counts", () => {
    delete process.env.VERCEL;
    expect(clientIp(req({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(req({ "x-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2" }))).toBe("1.1.1.1");
    process.env.TRUSTED_PROXY_HOPS = "2";
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6, 198.51.100.7, 10.0.0.2" }))).toBe("198.51.100.7");
  });

  it("on Vercel the edge's x-real-ip wins", () => {
    process.env.VERCEL = "1";
    expect(clientIp(req({ "x-forwarded-for": "6.6.6.6", "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
  });

  it("rotating the spoofed IP no longer resets the per IP magic link budget", async () => {
    delete process.env.VERCEL;
    let last = 0;
    for (let i = 0; i < 25; i++) {
      const r = await guardMagicLink(new Request("http://x.test/api/auth/sign-in/magic-link", { method: "POST", headers: { "x-forwarded-for": `7.7.${i}.1, 203.0.113.50`, "content-type": "application/json" }, body: JSON.stringify({ email: `u${i}@studio.test` }) }), db);
      last = r?.status ?? 0;
    }
    expect(last).toBe(429);
  });

  it("victim+1@, victim+2@ ... share one mailbox budget (magic links and invitations)", async () => {
    expect(mailboxKey(" Victim+promo@Studio.test ")).toBe("victim@studio.test");
    expect(mailboxKey("j.o.e+x@gmail.com")).toBe("joe@gmail.com");
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await guardMagicLink(new Request("http://x.test/a", { method: "POST", headers: { "x-forwarded-for": `9.9.9.${i}`, "content-type": "application/json" }, body: JSON.stringify({ email: `victim+${i}@studio.test` }) }), db);
      statuses.push(r?.status ?? 0);
    }
    expect(statuses.at(-1)).toBe(429);
    const inv: number[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await guardInvite(new Request("http://x.test/a", { method: "POST", headers: { "x-forwarded-for": "9.9.8.1", "content-type": "application/json" }, body: JSON.stringify({ email: `victim+${i}@studio.test` }) }), db);
      inv.push(r?.status ?? 0);
    }
    expect(inv.at(-1)).toBe(429);
  });

  it("the guard's path match cannot be dodged with case, encoding or a trailing slash", () => {
    for (const p of ["/api/auth/sign-in/magic-link", "/api/auth/Sign-In/Magic-Link/", "/api/auth/sign-in/magic%2Dlink", "/api/auth/sign-in/magic-link//"])
      expect(authPath(`http://x.test${p}`).endsWith("/sign-in/magic-link"), p).toBe(true);
  });
});

describe("SR-3 founder console through an unverified address", () => {
  it("ADMIN_EMAILS only counts when the address is verified", () => {
    process.env.ADMIN_EMAILS = "founder@studio.test";
    expect(isFounderAdmin({ email: "founder@studio.test", emailVerified: true })).toBe(true);
    expect(isFounderAdmin({ email: "Founder@Studio.test", emailVerified: false })).toBe(false);
    expect(isFounderAdmin({ email: "founder@studio.test" })).toBe(false);
    expect(isFounderAdmin(null)).toBe(false);
  });
});

describe("SR-4 account takeover by linking a GitHub account with an unverified address", () => {
  it("GitHub is not a trusted provider: linking needs GitHub's verified flag", () => {
    const auth = createAuth(memoryAdapter({ user: [], session: [], account: [], verification: [] } as never), { clientId: "x", clientSecret: "y" } as never);
    expect(auth.options.account?.accountLinking?.trustedProviders ?? []).toEqual([]);
    expect(auth.options.account?.accountLinking?.enabled).toBe(true);
  });
});

describe("SR-6 role table matches what the API key plugin asks for", () => {
  it("owners and admins can create, update and delete org keys; members and viewers cannot", () => {
    for (const a of ["create", "update", "delete"]) {
      expect(can("owner", "apiKey", a)).toBe(true);
      expect(can("admin", "apiKey", a)).toBe(true);
      expect(can("member", "apiKey", a)).toBe(false);
      expect(can("viewer", "apiKey", a)).toBe(false);
    }
  });
});
