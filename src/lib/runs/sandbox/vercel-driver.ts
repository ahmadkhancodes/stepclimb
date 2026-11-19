import { Sandbox } from "@vercel/sandbox";
import type { SandboxDriver } from "../sandbox-runner";

export interface VercelCreds { token: string; teamId: string; projectId: string }

/**
 * The real adapter over `@vercel/sandbox`. On Vercel the SDK authenticates with the project's OIDC token, so `creds` is only
 * for local runs and the manual test script. Sandboxes are not persistent: nothing survives a run.
 */
export function createVercelDriver(creds?: VercelCreds): SandboxDriver {
  const auth = creds ? { token: creds.token, teamId: creds.teamId, projectId: creds.projectId } : {};
  const get = (id: string) => Sandbox.get({ name: id, ...auth } as never);
  return {
    async create(o) {
      const allow: Record<string, { transform: { headers: Record<string, string> }[] }[]> = {};
      for (const h of o.networkPolicy.allow) allow[h] = [];
      for (const r of o.injectionRules) allow[r.host] = [{ transform: [{ headers: r.headers }] }];
      const sb = await Sandbox.create({
        ...auth,
        source: { type: "snapshot", snapshotId: o.snapshot },
        resources: { vcpus: o.vcpus },
        timeout: o.timeoutMs,
        persistent: false,
        networkPolicy: { allow },
        tags: { app: "stepclimb" },
      } as never);
      const id = sb.name ?? (sb as unknown as { sandbox?: { name?: string } }).sandbox?.name;
      if (!id) throw new Error("sandbox_id_missing");
      return { id };
    },
    async writeFiles(id, files) {
      const sb = await get(id);
      await sb.writeFiles(files.map((f) => ({ path: f.path, content: Buffer.from(f.content, "utf8") })));
    },
    async runDetached(id, cmd, env) {
      const sb = await get(id);
      await sb.runCommand({ cmd: cmd[0]!, args: cmd.slice(1), env, detached: true } as never);
    },
    async readFile(id, path) { return (await get(id)).readFileToBuffer({ path }); },
    async stop(id) { await (await get(id)).stop().catch(() => undefined); },
    async list() {
      const page = await Sandbox.list({ tags: { app: "stepclimb" }, ...auth } as never);
      const rows = await (page as unknown as { toArray(): Promise<{ name: string; status: string }[]> }).toArray();
      return rows.map((r) => ({ id: r.name, status: (["pending", "running", "stopping", "stopped", "failed"].includes(r.status) ? r.status : "stopped") as "stopped" }));
    },
  };
}
