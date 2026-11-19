import { z } from "zod";
import type { GitHost } from "./git-host";

/**
 * What a sandbox hands back instead of pushing (D-35): its commits as plain file contents. The orchestrator validates it
 * (everything here is untrusted: customer code ran next to the agent) and publishes it with the write token, to the one
 * branch it computed itself.
 */
export const HANDBACK_PATH = "/home/vercel-sandbox/handback.json";
export const HANDBACK_LIMITS = { commits: 60, filesPerCommit: 5_000, totalBytes: 40 * 1024 * 1024, fileBytes: 20 * 1024 * 1024 } as const;

const path = z.string().min(1).max(500);
const File = z.union([
  z.object({ path, mode: z.enum(["100644", "100755"]), contentBase64: z.string().max(Math.ceil(HANDBACK_LIMITS.fileBytes * 1.4)) }),
  z.object({ path, deleted: z.literal(true) }),
]);
export const HandbackSchema = z.object({
  baseSha: z.string().regex(/^[0-9a-f]{40}$/),
  commits: z.array(z.object({ message: z.string().min(1).max(4_000), files: z.array(File).max(HANDBACK_LIMITS.filesPerCommit) })).min(1).max(HANDBACK_LIMITS.commits),
});
export type Handback = z.infer<typeof HandbackSchema>;

/** Paths a handback may touch. Never `.git`, never CI workflows (the app has no workflows permission and a bot must not add CI). */
export function safePath(p: string): boolean {
  if (p.startsWith("/") || p.includes("\\") || p.includes("\0")) return false;
  const parts = p.split("/");
  if (parts.some((s) => s === "" || s === "." || s === "..")) return false;
  if (parts[0]!.toLowerCase() === ".git" || parts.some((s) => s.toLowerCase() === ".git")) return false;
  if (p.toLowerCase().startsWith(".github/workflows/")) return false;
  return true;
}

export function parseHandback(raw: string): Handback {
  const hb = HandbackSchema.parse(JSON.parse(raw));
  let total = 0;
  for (const c of hb.commits) for (const f of c.files) {
    if (!safePath(f.path)) throw new Error("handback_unsafe_path");
    if ("contentBase64" in f) total += f.contentBase64.length * 0.75;
  }
  if (total > HANDBACK_LIMITS.totalBytes) throw new Error("handback_too_large");
  return hb;
}

/**
 * Builds the commits on GitHub through the git data API and points `branch` at the last one. `force` only for the branch
 * Stepclimb rebuilds every week; any other branch must not exist yet.
 */
export async function publishHandback(host: GitHost, fullName: string, hb: Handback, o: { branch: string; baseBranch: string; force: boolean }): Promise<string> {
  if (o.branch === o.baseBranch || !o.branch.startsWith("stepclimb/")) throw new Error("unexpected_branch");
  let parent = hb.baseSha;
  let tree = await host.commitTree(fullName, parent);
  if (!tree) throw new Error("handback_base_missing");
  for (const c of hb.commits) {
    const entries: { path: string; mode: "100644" | "100755"; sha: string | null }[] = [];
    const todo = c.files.slice();
    const workers = Array.from({ length: Math.min(6, todo.length) }, async () => {
      for (let f = todo.shift(); f; f = todo.shift()) {
        entries.push("deleted" in f ? { path: f.path, mode: "100644", sha: null } : { path: f.path, mode: f.mode, sha: await host.createBlob(fullName, f.contentBase64) });
      }
    });
    await Promise.all(workers);
    entries.sort((a, b) => a.path.localeCompare(b.path));
    tree = await host.createTree(fullName, tree!, entries);
    parent = await host.createCommit(fullName, { message: c.message, treeSha: tree, parentSha: parent });
  }
  const existing = await host.branchHead(fullName, o.branch);
  if (!existing) await host.createBranch(fullName, o.branch, parent);
  else if (o.force) await host.moveBranch(fullName, o.branch, parent, true);
  else throw new Error("branch_exists");
  return parent;
}
