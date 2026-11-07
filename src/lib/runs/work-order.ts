import type { CheckConclusion } from "./types";
import type { RunResult } from "./events";
import { redactSecrets } from "@/lib/engine/repair";

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
    const fence = fenceFor(s.agentPrompt);
    out.push(`   <details><summary>Details and agent prompt</summary>\n\n   ${s.bodyMd.replace(/\n/g, "\n   ")}\n\n   ${fence}text\n   ${s.agentPrompt.replace(/\n/g, "\n   ")}\n   ${fence}\n   </details>`);
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

// ---- untrusted text from the sandbox -> customer PR ----
// The result is produced next to customer code (composer scripts, tests, dependencies) and the event secret lives there
// too, so every string is treated as hostile: no live @mentions, no raw HTML, no links off a small allow list, no secrets,
// no fence break outs, bounded size. Structure (stamp, tables, counts) is rendered by us from typed values only.

const LINK_HOSTS = ["laravel.com", "github.com", "php.net", "packagist.org", "www.php.net", "stepclimb.buffersoltech.com"];
const ZWSP = "​";
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g;

function safeProse(line: string): string {
  let out = line.replace(/</g, "&lt;"); // no raw HTML (details, img, a, comments)
  out = out.replace(/@(?=[A-Za-z0-9-])/g, `@${ZWSP}`); // no user or team mentions
  out = out.replace(/!\[([^\]]*)\]\(([^)]*)\)/g, "$1 ($2)"); // no images (tracking pixels)
  return out.replace(/\[([^\]]*)\]\(([^)\s]*)[^)]*\)/g, (m, text: string, url: string) => {
    try {
      const u = new URL(url);
      return u.protocol === "https:" && LINK_HOSTS.includes(u.hostname) ? m : `${text} (${url.replace(/^\w+:\/\//, "")})`;
    } catch { return `${text} (${url})`; }
  });
}

/**
 * Neutralises markdown that acts on people or browsers outside code fences (fenced text renders literally, so it stays
 * readable: PHP arrows and generics survive). An unclosed fence is closed so it cannot swallow the rest of the PR body.
 */
export function safeMarkdown(s: string, max = 4_000): string {
  const text = redactSecrets(String(s ?? "")).replace(CONTROL, "");
  const clipped = text.length > max ? `${text.slice(0, max)}\n[truncated]` : text;
  let inFence = false;
  const lines = clipped.split("\n").map((line) => {
    if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return line; }
    return inFence ? line : safeProse(line);
  });
  if (inFence) lines.push("```");
  return lines.join("\n");
}
/** One line, no markdown control characters that change structure. */
export function safeInline(s: string, max = 200): string {
  const one = safeProse(redactSecrets(String(s ?? "")).replace(CONTROL, "").replace(/\s+/g, " ").slice(0, max * 2)).replace(/[`|]/g, "'").replace(/\[|\]/g, "").trim();
  return one.length > max ? `${one.slice(0, max)}…` : one;
}
const IDENT = /^[A-Za-z0-9@._:\/+-]{1,200}$/;
const ident = (s: string, fallback = "unknown") => (IDENT.test(String(s ?? "")) ? s : fallback);
const safePath = (p: string | undefined) => (p && /^[A-Za-z0-9._\/@+-]{1,300}$/.test(p) && !p.split("/").includes("..") && !p.startsWith("/") ? p : undefined);

/** Returns a copy of a sandbox result that is safe to render into a PR, a check run and review comments. */
export function sanitizeResult(r: RunResult): RunResult {
  const n = (v: unknown, max: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);
  return {
    ...r,
    verified: r.verified === true,
    hasTests: r.hasTests === true,
    recipes: (r.recipes ?? []).slice(0, 100).map((x) => ({ key: ident(x.key), version: ident(x.version, "?"), commitSha: x.commitSha && /^[0-9a-zA-Z]{1,64}$/.test(x.commitSha) ? x.commitSha : null, changedFiles: (x.changedFiles ?? []).map((f) => safePath(f)).filter((f): f is string => !!f).slice(0, 5_000), noop: !!x.noop })),
    repair: { passes: n(r.repair?.passes, 10), rulesApplied: (r.repair?.rulesApplied ?? []).map((k) => ident(k)).slice(0, 100), unmatchedSignatures: (r.repair?.unmatchedSignatures ?? []).map((k) => redactSecrets(String(k)).replace(CONTROL, "").slice(0, 4_000)).filter(Boolean).slice(0, 50), stopReason: ident(r.repair?.stopReason ?? "", "unknown") },
    squawks: (r.squawks ?? []).slice(0, 200).map((s) => {
      const file = safePath(s.file);
      return { severity: SEV[s.severity] ? s.severity : "review", ...(file ? { file } : {}), ...(file && s.line ? { line: n(s.line, 10_000_000) || 1 } : {}), title: safeInline(s.title), bodyMd: safeMarkdown(s.bodyMd), agentPrompt: redactSecrets(String(s.agentPrompt ?? "")).replace(CONTROL, "").slice(0, 8_000) };
    }),
    changedFileCount: n(r.changedFileCount, 1_000_000),
    computeSeconds: n(r.computeSeconds, 86_400),
    ...(r.aborted !== undefined ? { aborted: safeInline(r.aborted) } : {}),
    ...(r.updates ? { updates: r.updates.slice(0, 500).map((u) => ({ ecosystem: u.ecosystem === "npm" ? "npm" : "composer", name: ident(u.name), from: ident(u.from, "?"), to: ident(u.to, "?") })) } : {}),
  };
}

/** A fence longer than any backtick run inside, so untrusted text cannot close it early. */
export function fenceFor(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  return "`".repeat(Math.max(3, longest + 1));
}
