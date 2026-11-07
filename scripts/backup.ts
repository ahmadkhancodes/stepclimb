/**
 * Export a snapshot of the product collections to a gzip file plus its sha256.
 *   MONGODB_URI=... MONGODB_DB=stepclimb BACKUP_DIR=./backups npx tsx scripts/backup.ts
 * With no MONGODB_URI it exports the (empty) memory driver; `--demo` seeds a few documents first so the flow can be tried.
 * The nightly cron job (`/api/cron/backup`) uses the same code; R2 upload plugs in as a BackupSink (docs/MANUAL_STEPS.md).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { product } from "../src/config/product";
import { createMemoryDb } from "../src/lib/db/memory";
import { mongoClient } from "../src/lib/db/mongo";
import { exportSnapshot, memoryStore, mongoStore, serializeSnapshot, type CollectionStore } from "../src/lib/ops/backup";

export async function openStore(demo = false): Promise<{ store: CollectionStore; close: () => Promise<void>; label: string }> {
  const uri = process.env.MONGODB_URI;
  if (uri && process.env.DB_DRIVER !== "memory") {
    const client = await mongoClient(uri);
    return { store: mongoStore(client.db(process.env.MONGODB_DB ?? product.slug) as never), close: () => client.close(), label: "mongo" };
  }
  const db = createMemoryDb(product.slug);
  if (demo) {
    await db.docs.put("runs", "demo-1", { fullName: "demo/app", status: "succeeded", createdAt: new Date() });
    await db.docs.put("credits", "demo-c", { accountId: "demo", kind: "to_latest", remaining: 1, expiresAt: new Date(Date.now() + 86_400_000) });
  }
  return { store: memoryStore(db), close: async () => undefined, label: "memory" };
}

async function main() {
  const { store, close, label } = await openStore(process.argv.includes("--demo"));
  const snap = await exportSnapshot(store);
  const { data, sha256 } = serializeSnapshot(snap);
  const dir = process.env.BACKUP_DIR ?? "backups";
  mkdirSync(dir, { recursive: true });
  const name = `${product.slug}-${snap.createdAt.replace(/[:.]/g, "-")}.json.gz`;
  writeFileSync(join(dir, name), data);
  writeFileSync(join(dir, `${name}.sha256`), `${sha256}  ${name}\n`);
  console.log(`backup (${label}): ${join(dir, name)} ${data.length} bytes, ${Object.entries(snap.collections).map(([k, v]) => `${k}=${v.length}`).join(" ") || "no collections"}`);
  await close();
}
if (process.argv[1]?.endsWith("backup.ts")) main().catch((e) => { console.error(e); process.exit(1); });
