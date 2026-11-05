import { uuidv7 } from "@/lib/ids";
import type { DocFilter, DocStore, AuditEntry, BillingAccount, Db, Entitlement, Suppression, WebhookDelivery, WebhookEndpoint } from "./types";

/** In-memory Db for tests, local dev and stub mode. Same semantics as the Mongo driver (dbContract.ts). */
export function createMemoryDb(app: string, config: Record<string, string> = {}): Db {
  const accounts = new Map<string, BillingAccount>();
  const ents = new Map<string, Entitlement>();
  const events = new Set<string>();
  const usage = new Map<string, number>();
  const limits = new Map<string, number[]>();
  const audit: AuditEntry[] = [];
  const endpoints = new Map<string, WebhookEndpoint>();
  const deliveries = new Map<string, WebhookDelivery>();
  const suppressions = new Map<string, Suppression>();
  const cfg = new Map(Object.entries(config));
  const clone = <T>(x: T): T => structuredClone(x);
  const sKey = (email: string, scope = "all") => `${email.toLowerCase()}|${scope}`;

  const colls = new Map<string, Map<string, Record<string, unknown>>>();
  const coll = (n: string) => colls.get(n) ?? colls.set(n, new Map()).get(n)!;
  const matches = (d: Record<string, unknown>, f: DocFilter, inn?: { field: string; values: string[] }) =>
    Object.entries(f).every(([k, v]) => d[k] === v) && (!inn || inn.values.includes(String(d[inn.field])));
  const docs: DocStore = {
    async put(c, id, doc) {
      const m = coll(c);
      m.set(id, { ...clone(m.get(id) ?? {}), ...clone(doc) });
    },
    async insert(c, id, doc) {
      const m = coll(c);
      if (m.has(id)) return false;
      m.set(id, clone(doc));
      return true;
    },
    async get(c, id) {
      const d = coll(c).get(id);
      return d ? ({ ...clone(d), id } as never) : null;
    },
    async find(c, filter = {}, opts = {}) {
      let out = [...coll(c).entries()].filter(([, d]) => matches(d, filter, opts.in)).map(([id, d]) => ({ ...clone(d), id }));
      const s = opts.sort;
      if (s) out = out.sort((a, b) => {
        const x = (a as Record<string, unknown>)[s.field] as never, y = (b as Record<string, unknown>)[s.field] as never;
        return (x < y ? -1 : x > y ? 1 : 0) * s.dir;
      });
      return (opts.limit ? out.slice(0, opts.limit) : out) as never;
    },
    async remove(c, filter, opts = {}) {
      const m = coll(c);
      let n = 0;
      for (const [id, d] of [...m.entries()]) if (matches(d, filter, opts.in)) { m.delete(id); n++; }
      return n;
    },
  };

  return {
    app,
    docs,
    async getBillingAccount(id) {
      const a = accounts.get(id);
      return a ? clone(a) : null;
    },
    async upsertBillingAccount(a) {
      const prev = accounts.get(a.id);
      accounts.set(a.id, { ...prev, ...a, app, createdAt: prev?.createdAt ?? a.createdAt ?? new Date() });
    },
    async findBillingAccountByCustomer(c) {
      const a = [...accounts.values()].find((x) => x.stripeCustomerId === c);
      return a ? clone(a) : null;
    },
    async getEntitlement(id) {
      const e = ents.get(id);
      return e ? clone(e) : null;
    },
    async setEntitlement(id, e) {
      ents.set(id, clone(e));
    },
    async hasStripeEvent(id) {
      return events.has(id);
    },
    async markStripeEvent(id) {
      if (events.has(id)) return false;
      events.add(id);
      return true;
    },
    async incUsage(orgId, meter, period, by = 1) {
      const k = `${orgId}|${meter}|${period}`;
      const v = (usage.get(k) ?? 0) + by;
      usage.set(k, v);
      return v;
    },
    async getUsage(orgId, meter, period) {
      return usage.get(`${orgId}|${meter}|${period}`) ?? 0;
    },
    async hitRateLimit(key, windowMs, now = Date.now()) {
      const hits = (limits.get(key) ?? []).filter((t) => t > now - windowMs);
      hits.push(now);
      limits.set(key, hits);
      return hits.length;
    },
    async appendAudit(e) {
      const entry: AuditEntry = { ...e, id: uuidv7(), app, at: e.at ?? new Date() };
      audit.push(Object.freeze(clone(entry)));
      return clone(entry);
    },
    async listAudit(orgId, { limit = 50, before } = {}) {
      return audit
        .filter((a) => a.orgId === orgId && (!before || a.at < before))
        .sort((a, b) => b.at.getTime() - a.at.getTime())
        .slice(0, limit)
        .map(clone);
    },
    async createWebhookEndpoint(e) {
      const ep: WebhookEndpoint = { ...e, app, createdAt: new Date() };
      endpoints.set(ep.id, ep);
      return clone(ep);
    },
    async listWebhookEndpoints(orgId) {
      return [...endpoints.values()].filter((e) => e.orgId === orgId).map(clone);
    },
    async getWebhookEndpoint(orgId, id) {
      const e = endpoints.get(id);
      return e && e.orgId === orgId ? clone(e) : null;
    },
    async updateWebhookEndpoint(orgId, id, patch) {
      const e = endpoints.get(id);
      if (e && e.orgId === orgId) endpoints.set(id, { ...e, ...patch });
    },
    async deleteWebhookEndpoint(orgId, id) {
      const e = endpoints.get(id);
      if (e && e.orgId === orgId) endpoints.delete(id);
    },
    async createDelivery(d) {
      deliveries.set(d.id, { ...clone(d), app });
    },
    async updateDelivery(id, patch) {
      const d = deliveries.get(id);
      if (d) deliveries.set(id, { ...d, ...clone(patch) });
    },
    async listDeliveries(orgId, { endpointId, limit = 50 } = {}) {
      return [...deliveries.values()]
        .filter((d) => d.orgId === orgId && (!endpointId || d.endpointId === endpointId))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit)
        .map(clone);
    },
    async getDelivery(orgId, id) {
      const d = deliveries.get(id);
      return d && d.orgId === orgId ? clone(d) : null;
    },
    async dueDeliveries(now, limit) {
      return [...deliveries.values()]
        .filter((d) => (d.status === "pending" || d.status === "retrying") && d.nextAttemptAt && d.nextAttemptAt <= now)
        .sort((a, b) => a.nextAttemptAt!.getTime() - b.nextAttemptAt!.getTime())
        .slice(0, limit)
        .map(clone);
    },
    async addSuppression(s) {
      suppressions.set(sKey(s.email, s.scope), { ...s, email: s.email.toLowerCase(), at: s.at ?? new Date() });
    },
    async isSuppressed(email, scope = "all") {
      return suppressions.has(sKey(email, "all")) || suppressions.has(sKey(email, scope));
    },
    async removeSuppression(email, scope = "all") {
      suppressions.delete(sKey(email, scope));
    },
    async getConfig() {
      return Object.fromEntries(cfg);
    },
    async setConfig(k, v) {
      cfg.set(k, v);
    },
    async exportOrgData(orgId) {
      return {
        billingAccount: accounts.get(orgId) ?? null,
        entitlement: ents.get(orgId) ?? null,
        webhookEndpoints: [...endpoints.values()].filter((e) => e.orgId === orgId).map(({ secret: _s, ...rest }) => rest),
        auditLog: audit.filter((a) => a.orgId === orgId),
      };
    },
    async deleteOrgData(orgId) {
      accounts.delete(orgId);
      ents.delete(orgId);
      for (const [k] of usage) if (k.startsWith(`${orgId}|`)) usage.delete(k);
      for (const [k, e] of endpoints) if (e.orgId === orgId) endpoints.delete(k);
      for (const [k, d] of deliveries) if (d.orgId === orgId) deliveries.delete(k);
      // The audit log is append-only: entries are kept (no PII beyond ids) per the privacy policy.
    },
  };
}
