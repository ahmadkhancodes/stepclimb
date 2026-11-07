import type { CheckConclusion } from "./types";
import type { RunResult } from "./events";

const SEV: Record<string, string> = { must_fix: "Must fix", review: "Review", note: "Note" };
const SEV_ORDER = ["must_fix", "review", "note"];

/** Stable short work order number shown in the PR title, check run and emails ("Work order #4821"). */
export function workOrderNo(runId: string): number {
  let h = 0;
  for (const ch of runId) h = (h * 31 + ch.charCodeAt(0)) % 9000;
  return 1000 + h;
}

export type Stamp = "VERIFIED" | "UNVERIFIED" | "FAILED" | "TIMED OUT";
export function stampFor(r: RunResult): Stamp {
  if (r.timedOut) return "TIMED OUT";
  if (r.verified) return "VERIFIED";
  if (!r.hasTests && r.verification.composer && r.verification.build !== false) return "UNVERIFIED";
  return "FAILED";
}

/** success: tests passed. neutral: no tests (amber "Unverified") or timed out. failure: something verified and failed. */
export function conclusionFor(r: RunResult): CheckConclusion {
  const s = stampFor(r);
  return s === "VERIFIED" ? "success" : s === "FAILED" ? "failure" : "neutral";
}

export function prTitle(fullName: string, hopTo: number, runId: string, r?: RunResult): string {
  const tail = r ? ` · ${stampFor(r)[0]}${stampFor(r).slice(1).toLowerCase()}` : "";
  return `Work order #${workOrderNo(runId)} · ${fullName} to Laravel ${hopTo}${tail}`;
}

const yes = (v: boolean | null) => (v === null ? "not run" : v ? "passed" : "failed");

export interface BodyInput { runId: string; fullName: string; hopFrom: number; hopTo: number; result: RunResult; appUrl: string }

/** The Work Order PR body: stamp, summary, recipes, verification, squawk index. */
export function buildWorkOrderBody(i: BodyInput): string {
  const r = i.result;
  const stamp = stampFor(r);
  const out: string[] = [];
  out.push(`# Work order #${workOrderNo(i.runId)}: Laravel ${i.hopFrom} to ${i.hopTo}`);
  out.push(`> **${stamp}** · Stepclimb by BufferSol · ${i.fullName}`);
  out.push("");
  out.push("## Summary");
  const lines = [`${r.recipes.filter((x) => !x.noop).length} recipes changed ${r.changedFileCount} files.`, r.repair.passes > 0 ? `The repair pass made ${r.repair.passes} fix commit${r.repair.passes === 1 ? "" : "s"} (${r.repair.rulesApplied.join(", ")}).` : "No repair pass was needed."];
  if (r.timedOut) lines.push("The run hit its time limit. This draft holds what was applied so far.");
  if (!r.hasTests) lines.push("No test suite was found, so this PR is **Unverified**: review it before merging.");
  out.push(lines.join(" "));
  out.push("");
  out.push("## Recipes");
  out.push("| Recipe | Version | Files |", "|---|---|---|");
  for (const x of r.recipes) out.push(`| \`${x.key}\` | ${x.version} | ${x.noop ? "no change" : x.changedFiles.length} |`);
  out.push("");
  out.push("## Verification");
  out.push("| Stage | Result |", "|---|---|");
  out.push(`| Composer update | ${yes(r.verification.composer)} |`, `| Frontend build | ${yes(r.verification.build)} |`, `| Tests | ${r.hasTests ? yes(r.verification.tests) : "no test suite"} |`);
  out.push("");
  const sq = [...r.squawks].sort((a, b) => SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity));
  out.push(`## Squawks (${sq.length})`);
  if (sq.length === 0) out.push("None.");
  sq.forEach((s, n) => {
    out.push(`${n + 1}. **${SEV[s.severity]}**: ${s.title}${s.file ? ` (\`${s.file}${s.line ? `:${s.line}` : ""}\`)` : ""}`);
    out.push(`   <details><summary>Details and agent prompt</summary>\n\n   ${s.bodyMd.replace(/\n/g, "\n   ")}\n\n   \`\`\`text\n   ${s.agentPrompt.replace(/\n/g, "\n   ")}\n   \`\`\`\n   </details>`);
  });
  out.push("");
  out.push(`---\nRerun is free for 14 days on this branch. [Work order ${workOrderNo(i.runId)}](${i.appUrl}/app/work-orders/${i.runId})`);
  return out.join("\n");
}

export function checkOutput(i: BodyInput): { title: string; summary: string; text: string } {
  const stamp = stampFor(i.result);
  return {
    title: `Stepclimb by BufferSol · ${stamp[0]}${stamp.slice(1).toLowerCase()}`,
    summary: `Laravel ${i.hopFrom} to ${i.hopTo}: composer ${yes(i.result.verification.composer)}, build ${yes(i.result.verification.build)}, tests ${i.result.hasTests ? yes(i.result.verification.tests) : "no test suite"}. ${i.result.squawks.length} squawks.`,
    text: buildWorkOrderBody(i),
  };
}

/** Review comments only for squawks that point at an exact line; the rest live in the PR body. */
export function reviewComments(r: RunResult): { path: string; line: number; body: string }[] {
  return r.squawks.filter((s) => s.file && s.line).map((s) => ({ path: s.file!, line: s.line!, body: `**${SEV[s.severity]}**: ${s.title}\n\n${s.bodyMd}` }));
}
