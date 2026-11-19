import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, lstatSync } from "node:fs";
import { dirname, join } from "node:path";
import { MemoryFs } from "@/lib/engine/vfs";
import type { VerifyResult } from "@/lib/engine/repair";
import type { DepUpdate } from "../events";
import type { RunEnv } from "../agent";
import { HANDBACK_LIMITS, type Handback } from "../handback";
import { composerLockDiff, npmLockDiff } from "./lockdiff";

export type Who = "agent" | "customer";
export interface ExecResult { code: number; output: string }
/** Runs a shell command in `cwd`. `customer` runs as the unprivileged user with a scrubbed environment (no event secret). */
export type Exec = (cmd: string, o: { cwd: string; timeoutMs: number; who: Who; env?: Record<string, string> }) => Promise<ExecResult>;

const SKIP_DIRS = new Set([".git", "vendor", "node_modules", "storage", ".idea", ".vscode"]);
const MAX_TEXT = 1024 * 1024;
const sha1 = (b: Buffer) => createHash("sha1").update(b).digest("hex");

function walk(root: string, rel: string, out: string[]) {
  for (const name of readdirSync(join(root, rel))) {
    const r = rel ? `${rel}/${name}` : name;
    const st = lstatSync(join(root, r));
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name) && !(rel === "public" && name === "build")) walk(root, r, out); } else if (st.isFile()) out.push(r);
  }
}

export interface DiskEnvOptions {
  /** checkout directory (repo root) */
  root: string;
  appPath: string;
  mode: "upgrade" | "deps";
  baseSha: string;
  exec: Exec;
  emit: RunEnv["emit"];
  now: () => number;
  deadlineAt: number;
  /** where the handback goes (written at push) */
  writeHandback: (hb: Handback) => void;
}

/**
 * RunEnv backed by a real checkout: text files are loaded into a MemoryFs for the engine, every command first flushes the
 * MemoryFs to disk, and commits are recorded as file contents (the orchestrator publishes them; the sandbox never pushes).
 */
export function createDiskEnv(o: DiskEnvOptions): RunEnv & { loaded: () => number } {
  const fs = new MemoryFs();
  const disk = new Map<string, string>(); // path -> sha1 as last seen on disk (text files only)
  const paths: string[] = [];
  walk(o.root, "", paths);
  for (const p of paths) {
    const abs = join(o.root, p);
    if (statSync(abs).size > MAX_TEXT) continue;
    const buf = readFileSync(abs);
    if (buf.includes(0)) continue; // binary: the engine never edits it
    fs.write(p, buf.toString("utf8"));
    disk.set(p, sha1(buf));
  }
  const appDir = o.appPath ? join(o.root, o.appPath) : o.root;
  const inApp = (f: string) => (o.appPath ? `${o.appPath}/${f}` : f);
  const handback: Handback = { baseSha: o.baseSha, commits: [] };
  let totalBytes = 0;
  const committed = new Map<string, string>(); // path -> sha1 of what the last commit recorded

  /** write the MemoryFs changes to disk (changed, new and deleted text files) */
  const flush = () => {
    const now = new Set(fs.list());
    for (const p of now) {
      const content = Buffer.from(fs.read(p)!, "utf8");
      const h = sha1(content);
      if (disk.get(p) === h) continue;
      mkdirSync(dirname(join(o.root, p)), { recursive: true });
      writeFileSync(join(o.root, p), content);
      disk.set(p, h);
    }
    for (const p of [...disk.keys()]) if (!now.has(p)) { rmSync(join(o.root, p), { force: true }); disk.delete(p); }
  };
  /** pick up what a command changed on disk for one file (lockfiles are bigger than the text cap, so they are read straight from disk) */
  const read = (p: string): Buffer | null => { try { return readFileSync(join(o.root, p)); } catch { return null; } };

  const run = async (cmd: string, timeoutMs: number, env?: Record<string, string>): Promise<ExecResult> => {
    flush();
    const left = o.deadlineAt - o.now();
    if (left < 10_000) return { code: 124, output: "deadline reached before the command started" };
    return o.exec(cmd, { cwd: appDir, timeoutMs: Math.min(timeoutMs, left), who: "customer", ...(env ? { env } : {}) });
  };

  const hasComposer = () => existsSync(join(appDir, "composer.json"));
  const hasNpm = () => existsSync(join(appDir, "package.json"));
  const testEnv = { APP_ENV: "testing", APP_KEY: "base64:" + Buffer.alloc(32, 7).toString("base64"), APP_DEBUG: "false", DB_CONNECTION: "sqlite", DB_DATABASE: ":memory:", CACHE_STORE: "array", CACHE_DRIVER: "array", SESSION_DRIVER: "array", QUEUE_CONNECTION: "sync", MAIL_MAILER: "array", BROADCAST_CONNECTION: "null", TELESCOPE_ENABLED: "false" };

  const env: RunEnv & { loaded: () => number } = {
    fs,
    loaded: () => paths.length,
    emit: o.emit,
    now: o.now,
    async updateDeps(): Promise<{ updates: DepUpdate[]; changedFiles: string[] }> {
      const updates: DepUpdate[] = [];
      const hash = (f: string) => { const b = read(inApp(f)); return b ? sha1(b) : null; };
      const watched = ["composer.json", "composer.lock", "package.json", "package-lock.json"];
      const before = Object.fromEntries(watched.map((f) => [f, hash(f)]));
      const text = (f: string) => read(inApp(f))?.toString("utf8");
      const tools: { present: boolean; lock: string; cmd: string; ms: number; diff: (a?: string, b?: string) => DepUpdate[] }[] = [
        { present: hasComposer(), lock: "composer.lock", cmd: "composer update --no-scripts --no-interaction --no-progress --prefer-dist", ms: 12 * 60_000, diff: composerLockDiff },
        { present: hasNpm(), lock: "package-lock.json", cmd: "npm update --ignore-scripts --no-audit --no-fund --no-progress", ms: 10 * 60_000, diff: npmLockDiff },
      ];
      for (const t of tools) {
        if (!t.present) continue;
        const lockBefore = text(t.lock);
        const r = await run(t.cmd, t.ms);
        await o.emit({ type: "log_chunk", stream: r.code === 0 ? "stdout" : "stderr", text: `${t.cmd.split(" ").slice(0, 2).join(" ")} exit ${r.code}\n${r.output.slice(-1_500)}` });
        if (r.code !== 0) throw new Error(`${t.cmd.split(" ")[0]}_update_failed`);
        updates.push(...t.diff(lockBefore, text(t.lock)));
      }
      const changedFiles = watched.filter((f) => hash(f) !== null && hash(f) !== before[f]).map(inApp);
      return { updates: updates.slice(0, 500), changedFiles: updates.length ? changedFiles : [] };
    },
    async verifyStage(stage): Promise<VerifyResult> {
      const done = (r: ExecResult): VerifyResult => ({ passed: r.code === 0, output: r.output, stage });
      if (stage === "composer") {
        if (!hasComposer()) return { passed: true, output: "no composer.json", stage };
        return done(await run(o.mode === "deps" ? "composer install --no-scripts --no-interaction --no-progress --prefer-dist" : "composer update --no-scripts --no-interaction --no-progress --prefer-dist", 12 * 60_000));
      }
      if (stage === "build") {
        if (!hasNpm()) return { passed: true, output: "no package.json", stage };
        const install = existsSync(join(appDir, "node_modules")) ? { code: 0, output: "" } : await run(existsSync(join(appDir, "package-lock.json")) ? "npm ci --ignore-scripts --no-audit --no-fund --no-progress" : "npm install --ignore-scripts --no-audit --no-fund --no-progress", 8 * 60_000);
        if (install.code !== 0) return done(install);
        return done(await run("npm run build", 10 * 60_000));
      }
      if (stage === "tests") {
        const prep = existsSync(join(appDir, ".env")) || !existsSync(join(appDir, ".env.example")) ? "" : "cp .env.example .env && ";
        const bin = existsSync(join(appDir, "vendor/bin/pest")) ? "vendor/bin/pest --no-interaction" : "vendor/bin/phpunit --no-interaction";
        return done(await run(`${prep}${bin}`, 15 * 60_000, testEnv));
      }
      if (!existsSync(join(appDir, "vendor/bin/phpstan"))) return { passed: true, output: "no phpstan", stage };
      return done(await run("vendor/bin/phpstan analyse --no-progress --no-interaction --memory-limit=1G", 10 * 60_000));
    },
    async runExternal(step) {
      const r = await run(step.command.map((c) => `'${c.replace(/'/g, "'\\''")}'`).join(" "), 10 * 60_000);
      flushFromDisk();
      return { ok: r.code === 0, output: r.output };
    },
    async commit(message, files) {
      const c: Handback["commits"][number] = { message: message.slice(0, 4_000), files: [] };
      for (const f of [...new Set(files)]) {
        const buf = read(f);
        if (!buf) { if (committed.has(f) || disk.has(f) || fs.read(f) === undefined) c.files.push({ path: f, deleted: true }); continue; }
        const h = sha1(buf);
        if (committed.get(f) === h) continue;
        totalBytes += buf.length;
        if (buf.length > HANDBACK_LIMITS.fileBytes || totalBytes > HANDBACK_LIMITS.totalBytes) throw new Error("handback_too_large");
        let mode: "100644" | "100755" = "100644";
        try { if (statSync(join(o.root, f)).mode & 0o111) mode = "100755"; } catch { /* keep 644 */ }
        c.files.push({ path: f, mode, contentBase64: buf.toString("base64") });
        committed.set(f, h);
      }
      if (c.files.length === 0) return `empty${handback.commits.length}`;
      handback.commits.push(c);
      return `c${String(handback.commits.length).padStart(4, "0")}`;
    },
    async push(branch) {
      flush();
      if (handback.commits.length === 0) throw new Error("nothing_to_push");
      o.writeHandback(handback);
      void branch;
      return "handback";
    },
  };
  /** after an external tool (rector, pint) ran on disk, mirror its edits into the MemoryFs so the engine sees them */
  function flushFromDisk() {
    for (const p of fs.list()) {
      const b = read(p);
      if (!b) { fs.delete(p); disk.delete(p); continue; }
      const h = sha1(b);
      if (disk.get(p) !== h && b.length <= MAX_TEXT && !b.includes(0)) { fs.write(p, b.toString("utf8")); disk.set(p, h); }
    }
  }
  return env;
}
