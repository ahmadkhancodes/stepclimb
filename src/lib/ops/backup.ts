import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import type { Db } from "@/lib/db";

/**
 * Backup and restore (docs/ARCHITECTURE.md P0-1). The free Atlas cluster has no backups, so a snapshot of the product
 * collections is exported nightly and a drill restores it into a scratch database and compares document counts.
 * Works on the memory driver (through `Db.docs`) and on Mongo (raw collections), behind one `CollectionStore` seam.
 */
export type Doc = Record<string, unknown>;

export interface CollectionStore {
  names(): Promise<string[]>;
  read(name: string): Promise<Doc[]>;
  write(name: string, docs: Doc[]): Promise<void>;
  count(name: string): Promise<number>;
}

/** Collections on `Db.docs` that matter to customers and to money. Logs and caches (run_logs older than retention, webhook_events) are included: they are small and capped. */
export const BACKUP_COLLECTIONS = [
  "installations", "repos", "apps", "scans", "github_app", "runs", "run_steps", "run_logs", "squawks", "credits", "unmatched_signatures",
  "autopilot_state", "pins", "account_contacts", "github_users", "webhook_events", "webhook_failures", "backup_manifests", "alert_state", "heartbeats",
] as const;

/** Mongo collections never exported: sessions and rate limit counters are disposable. */
const SKIP_MONGO = new Set(["rate_limits", "rate_limit", "session", "verification", "stripe_events"]);

export function memoryStore(db: Db, names: readonly string[] = BACKUP_COLLECTIONS): CollectionStore {
  return {
    async names() { return [...names]; },
    async read(name) { return (await db.docs.find<Doc>(name)) as Doc[]; },
    async write(name, docs) { for (const d of docs) { const { id, ...rest } = d as { id: string } & Doc; await db.docs.put(name, id, rest); } },
    async count(name) { return (await db.docs.find(name)).length; },
  };
}

/** The slice of the MongoDB driver's `Db` the backup needs (so tests can fake it). */
export interface MongoDbLike {
  listCollections(): { toArray(): Promise<{ name: string }[]> };
  collection(name: string): {
    find(filter: Doc): { toArray(): Promise<Doc[]> };
    insertMany(docs: Doc[]): Promise<unknown>;
    countDocuments(): Promise<number>;
  };
  dropDatabase(): Promise<unknown>;
}

export function mongoStore(db: MongoDbLike): CollectionStore {
  return {
    async names() { return (await db.listCollections().toArray()).map((c) => c.name).filter((n) => !n.startsWith("system.") && !SKIP_MONGO.has(n)); },
    async read(name) { return db.collection(name).find({}).toArray(); },
    async write(name, docs) { if (docs.length) await db.collection(name).insertMany(docs); },
    async count(name) { return db.collection(name).countDocuments(); },
  };
}

export interface Snapshot { version: 1; createdAt: string; collections: Record<string, Doc[]> }

export async function exportSnapshot(src: CollectionStore, now = new Date()): Promise<Snapshot> {
  const collections: Record<string, Doc[]> = {};
  for (const n of await src.names()) collections[n] = await src.read(n);
  return { version: 1, createdAt: now.toISOString(), collections };
}

export const countsOf = (s: Snapshot): Record<string, number> => Object.fromEntries(Object.entries(s.collections).map(([k, v]) => [k, v.length]));

// Dates survive the JSON round trip as { $date }
const replacer = function (this: Record<string, unknown>, k: string, v: unknown) {
  const raw = this[k];
  return raw instanceof Date ? { $date: raw.toISOString() } : v;
};
const reviver = (_k: string, v: unknown) => (v && typeof v === "object" && "$date" in (v as object) && Object.keys(v as object).length === 1 ? new Date((v as { $date: string }).$date) : v);

export function serializeSnapshot(s: Snapshot): { data: Buffer; sha256: string } {
  const data = gzipSync(Buffer.from(JSON.stringify(s, replacer)));
  return { data, sha256: createHash("sha256").update(data).digest("hex") };
}
export function parseSnapshot(data: Buffer, sha256?: string): Snapshot {
  if (sha256 && createHash("sha256").update(data).digest("hex") !== sha256) throw new Error("backup_checksum_mismatch");
  const s = JSON.parse(gunzipSync(data).toString("utf8"), reviver) as Snapshot;
  if (s.version !== 1 || !s.collections) throw new Error("backup_format_unknown");
  return s;
}

export async function restoreSnapshot(s: Snapshot, target: CollectionStore): Promise<void> {
  for (const [name, docs] of Object.entries(s.collections)) await target.write(name, docs);
}

export interface DrillReport { ok: boolean; expected: Record<string, number>; restored: Record<string, number>; mismatches: string[] }

/** Restores the snapshot into a scratch target and compares the document count of every collection. */
export async function restoreDrill(s: Snapshot, scratch: CollectionStore): Promise<DrillReport> {
  await restoreSnapshot(s, scratch);
  const expected = countsOf(s);
  const restored: Record<string, number> = {};
  const mismatches: string[] = [];
  for (const [name, n] of Object.entries(expected)) {
    restored[name] = await scratch.count(name);
    if (restored[name] !== n) mismatches.push(`${name}: expected ${n}, restored ${restored[name]}`);
  }
  return { ok: mismatches.length === 0, expected, restored, mismatches };
}

/** Where backups go. R2 (`ObjectStore`) plugs in here; `fileSink` serves local runs and the VPS. */
export interface BackupSink { put(name: string, data: Buffer): Promise<string> }

/** Nightly job body: export, store when a sink exists, always record a manifest (counts and checksum) in `backup_manifests`. */
export async function runBackup(db: Db, src: CollectionStore, sink: BackupSink | null, now = new Date()): Promise<{ name: string; stored: boolean; sha256: string; counts: Record<string, number> }> {
  const snap = await exportSnapshot(src, now);
  const { data, sha256 } = serializeSnapshot(snap);
  const name = `stepclimb-${now.toISOString().replace(/[:.]/g, "-")}.json.gz`;
  const counts = countsOf(snap);
  let location: string | null = null;
  if (sink) location = await sink.put(name, data);
  await db.docs.put("backup_manifests", name, { name, createdAt: now, sha256, bytes: data.length, counts, stored: !!sink, location });
  return { name, stored: !!sink, sha256, counts };
}
