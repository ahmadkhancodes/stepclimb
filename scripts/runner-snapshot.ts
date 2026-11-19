/**
 * Builds the Vercel Sandbox snapshot real runs start from: PHP 8.3 (+ extensions), Composer, a locked down `stepclimb-run`
 * user for customer commands and the shared /work directory. Prints the snapshot id: set it as RUNNER_SNAPSHOT_ID.
 * Needs SANDBOX_VERCEL_TOKEN (or VERCEL_TOKEN_NEW_ACCOUNT), VERCEL_TEAM_ID and VERCEL_PROJECT_ID.
 */
import { Sandbox } from "@vercel/sandbox";

const token = process.env.SANDBOX_VERCEL_TOKEN ?? process.env.VERCEL_TOKEN_NEW_ACCOUNT;
const teamId = process.env.VERCEL_TEAM_ID, projectId = process.env.VERCEL_PROJECT_ID;
if (!token || !teamId || !projectId) throw new Error("set SANDBOX_VERCEL_TOKEN (or VERCEL_TOKEN_NEW_ACCOUNT), VERCEL_TEAM_ID, VERCEL_PROJECT_ID");

const PHP = ["cli", "mbstring", "xml", "pdo", "process", "bcmath", "intl", "gd", "opcache", "zip"].map((e) => `php8.3-${e}`).join(" ");
const STEPS = [
  `sudo dnf install -y --setopt=install_weak_deps=False ${PHP} unzip`,
  "curl -sS https://getcomposer.org/installer | php -- --install-dir=/tmp --filename=composer && sudo install -m 755 /tmp/composer /usr/local/bin/composer",
  // customer commands run as this user; it cannot read the agent's home or its environment
  "sudo useradd -m -s /bin/bash stepclimb-run && sudo usermod -aG stepclimb-run vercel-sandbox && sudo chmod 750 /home/vercel-sandbox",
  "sudo mkdir -p /work && sudo chown stepclimb-run:stepclimb-run /work && sudo chmod 2775 /work",
  "php -v | head -1 && composer --version | head -1 && id stepclimb-run",
];

async function main() {
  const sb = await Sandbox.create({ token, teamId, projectId, runtime: "node24", timeout: 20 * 60_000, resources: { vcpus: 4 } } as never);
  for (const s of STEPS) {
    const r = await sb.runCommand({ cmd: "bash", args: ["-lc", s] });
    console.log(`$ ${s.slice(0, 70)} -> ${r.exitCode}\n${(await r.stdout()).slice(-300)}`);
    if (r.exitCode !== 0) { console.error((await r.stderr()).slice(-600)); await sb.stop(); process.exit(1); }
  }
  const snap = await sb.snapshot({ expiration: 0 });
  console.log(`RUNNER_SNAPSHOT_ID=${snap.snapshotId}`);
}
void main();
