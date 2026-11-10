import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function fakeClient(createIndex: () => Promise<unknown>) {
  const calls = { n: 0 };
  const col = { createIndex: vi.fn(() => { calls.n++; return createIndex(); }), findOne: vi.fn(async () => null) };
  const client = { db: () => ({ collection: () => col }) };
  return { client, col, calls };
}

describe("auto indexes", () => {
  const g = globalThis as Record<string, unknown>;
  beforeEach(() => { delete g.__kitIndexes; delete g.__kitMongo; vi.resetModules(); });
  afterEach(() => { delete g.__kitIndexes; delete g.__kitMongo; vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  async function open(f: ReturnType<typeof fakeClient>) {
    g.__kitMongo = { uri: "mongodb://x", client: Promise.resolve(f.client) };
    const { createMongoDb } = await import("@/lib/db/mongo");
    return createMongoDb("mongodb://x", "d", "stepclimb");
  }

  it("runs once and not again on later calls", async () => {
    const f = fakeClient(async () => "ok");
    const db = await open(f);
    await db.docs.get("c", "1");
    await new Promise((r) => setTimeout(r, 10));
    const first = f.calls.n;
    expect(first).toBeGreaterThan(10);
    await db.docs.get("c", "2");
    const db2 = await open(f);
    await db2.docs.get("c", "3");
    await new Promise((r) => setTimeout(r, 10));
    expect(f.calls.n).toBe(first);
  });

  it("an index error does not break the request and is scrubbed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = fakeClient(async () => { throw new Error("bad mongodb+srv://u:pw@host/db"); });
    const db = await open(f);
    await expect(db.docs.get("c", "1")).resolves.toBeNull();
    await new Promise((r) => setTimeout(r, 10));
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).not.toContain("pw@");
  });

  it("conflicts are logged and the rest still run", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let i = 0;
    const f = fakeClient(async () => { if (i++ === 0) throw Object.assign(new Error("c"), { code: 85 }); });
    const db = await open(f);
    await db.docs.get("c", "1");
    await new Promise((r) => setTimeout(r, 10));
    expect(f.calls.n).toBeGreaterThan(10);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("is skipped during next build", async () => {
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    const f = fakeClient(async () => "ok");
    const db = await open(f);
    await db.docs.get("c", "1");
    expect(f.calls.n).toBe(0);
  });

  it("is skipped for the memory driver", async () => {
    vi.stubEnv("DB_DRIVER", "memory");
    const f = fakeClient(async () => "ok");
    g.__kitMongo = { uri: "mongodb://x", client: Promise.resolve(f.client) };
    const { getDb } = await import("@/lib/db");
    const db = await getDb();
    await db.docs.get("c", "1");
    expect(f.calls.n).toBe(0);
  });
});
