/**
 * Monthly restore drill: restore a backup into a SCRATCH database and compare document counts.
 *   npx tsx scripts/restore-drill.ts backups/stepclimb-....json.gz [stepclimb.json.gz.sha256]
 *   npx tsx scripts/restore-drill.ts --demo          # export the memory driver with sample data and drill that
 * Mongo: the scratch database is `${MONGODB_DB}_drill_<timestamp>` and is dropped afterwards. The live database is only read.
 * Exit code 1 when any collection count differs, so a cron or CI job can alert on it.
 */
import { readFileSync } from "node:fs";
import { product } from "../src/config/product";
import { createMemoryDb } from "../src/lib/db/memory";
import { mongoClient } from "../src/lib/db/mongo";
import { exportSnapshot, memoryStore, mongoStore, parseSnapshot, restoreDrill, serializeSnapshot } from "../src/lib/ops/backup";
import { openStore } from "./backup";

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const demo = process.argv.includes("--demo");
  let snap;
  if (args[0]) {
    const sha = args[1] ? readFileSync(args[1], "utf8").split(/\s+/)[0] : undefined;
    snap = parseSnapshot(readFileSync(args[0]), sha);
  } else {
    const { store, close } = await openStore(demo);
    snap = parseSnapshot(serializeSnapshot(await exportSnapshot(store)).data);
    await close();
  }
  const uri = process.env.MONGODB_URI;
  let report;
  if (uri && process.env.DB_DRIVER !== "memory") {
    const client = await mongoClient(uri);
    const scratch = client.db(`${process.env.MONGODB_DB ?? product.slug}_drill_${Date.now()}`);
    try { report = await restoreDrill(snap, mongoStore(scratch as never)); } finally { await scratch.dropDatabase(); await client.close(); }
  } else {
    report = await restoreDrill(snap, memoryStore(createMemoryDb("drill")));
  }
  console.log(`restore drill: ${report.ok ? "OK" : "FAILED"}`);
  for (const [k, n] of Object.entries(report.expected)) console.log(`  ${k}: expected ${n}, restored ${report.restored[k]}`);
  for (const m of report.mismatches) console.error(`  MISMATCH ${m}`);
  if (!report.ok) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
