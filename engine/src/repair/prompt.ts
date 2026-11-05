import type { Squawk } from '../types.js';
import type { VirtualFs } from '../vfs.js';
import { redactSecrets } from './redact.js';
import type { VerifyResult } from './types.js';

export const EXCERPT_CAP = 4000;

export interface Hop { from: number; to: number }
export interface FileRef { file: string; line?: number }

export function upgradeGuideUrl(hop?: Hop): string {
  return hop ? `https://laravel.com/docs/${hop.to}.x/upgrade` : 'https://laravel.com/docs/master/upgrade';
}

/** Redact first, then cap, so a secret can never be split across the cut and survive. */
export function excerptOf(output: string, cap = EXCERPT_CAP): string {
  const clean = redactSecrets(output.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')).trim();
  if (clean.length <= cap) return clean;
  const marker = '\n[... truncated ...]\n';
  const head = Math.floor((cap - marker.length) * 0.6);
  const tail = cap - marker.length - head;
  return clean.slice(0, head) + marker + clean.slice(clean.length - tail);
}

const FILE_RE = /((?:[A-Za-z]:)?[\w@.~/\\-]+\.(?:php|json|xml|neon|ya?ml|js|ts|vue))(?:(?::|\s+on\s+line\s+|\s+line\s+)(\d+))?/g;

/** File paths mentioned in failure output, in order of first appearance. Resolved against `fs` when given. */
export function parseFileRefs(output: string, fs?: VirtualFs, max = 10): FileRef[] {
  const out: FileRef[] = [];
  const seen = new Set<string>();
  for (const m of output.matchAll(FILE_RE)) {
    let file = (m[1] ?? '').replace(/\\/g, '/');
    if (!file.includes('/') && !/^(?:composer\.json|composer\.lock|phpunit\.xml|phpstan\.neon)$/.test(file)) continue;
    if (/^(?:https?:)?\/\//.test(file) || file.includes('vendor/composer/')) continue;
    if (fs) {
      const resolved = resolveInRepo(file, fs);
      if (!resolved) continue;
      file = resolved;
    } else file = file.replace(/^\.\//, '');
    const line = m[2] ? Number(m[2]) : undefined;
    if (seen.has(file)) continue;
    seen.add(file);
    out.push(line === undefined ? { file } : { file, line });
    if (out.length >= max) break;
  }
  return out;
}

function resolveInRepo(file: string, fs: VirtualFs): string | undefined {
  const parts = file.split('/').filter((p) => p && p !== '.');
  for (let i = 0; i < parts.length; i++) {
    const cand = parts.slice(i).join('/');
    if (fs.exists(cand)) return cand;
  }
  return undefined;
}

export interface PromptInput {
  title: string;
  stage: VerifyResult['stage'];
  files: FileRef[];
  excerpt: string;
  guideUrl: string;
  hop?: Hop;
}

/** Templated, ready to paste into the customer's own coding agent. Never produced by a model. */
export function buildAgentPrompt(i: PromptInput): string {
  const hop = i.hop ? ` while upgrading Laravel ${i.hop.from}.x to ${i.hop.to}.x` : '';
  const files = i.files.length
    ? i.files.map((f) => `- ${f.file}${f.line ? `:${f.line}` : ''}`).join('\n')
    : '- (no file path found in the output; start from composer.json and the failing stage)';
  return [
    `You are working in a Laravel repository${hop}. The ${i.stage} check fails and Stepclimb's rule based repair could not fix it.`,
    '',
    `Problem: ${i.title}`,
    '',
    'Relevant files:',
    files,
    '',
    'Failing output (secrets redacted):',
    '```',
    i.excerpt,
    '```',
    '',
    `Upgrade guide: ${i.guideUrl}`,
    '',
    'Task: make the smallest change that fixes this failure, following the upgrade guide. Do not upgrade unrelated packages or reformat unrelated code.',
    `Then re-run the ${i.stage} check and confirm it passes before you stop. If it fails with a different error, repeat on that error.`,
  ].join('\n');
}

const firstLine = (s: string) => (s.split(/\r?\n/).find((l) => l.trim()) ?? '').trim().slice(0, 140);

/** Split composer output into its "Problem N" blocks; other stages are a single block. */
export function failureBlocks(v: VerifyResult): string[] {
  if (v.stage === 'composer') {
    const parts = v.output.split(/^(?=\s*Problem \d+\s*$)/m).map((s) => s.trim()).filter(Boolean);
    const problems = parts.filter((p) => /^Problem \d+/.test(p));
    if (problems.length > 0) return problems.slice(0, 5);
  }
  return [v.output];
}

export function squawksFromFailure(v: VerifyResult, opts: { fs?: VirtualFs; hop?: Hop } = {}): Squawk[] {
  const guideUrl = upgradeGuideUrl(opts.hop);
  return failureBlocks(v).map((block, idx) => {
    const files = parseFileRefs(block, opts.fs);
    const excerpt = excerptOf(block);
    const headline = firstLine(excerpt) || `${v.stage} failed`;
    const title = `${v.stage} failure${idx > 0 || failureBlocks(v).length > 1 ? ` ${idx + 1}` : ''}: ${redactSecrets(headline)}`;
    const first = files[0];
    return {
      severity: 'must_fix' as const,
      ...(first ? { file: first.file, ...(first.line ? { line: first.line } : {}) } : {}),
      title,
      bodyMd: [
        `The ${v.stage} step still fails after the rule based repair pass. No repair rule covers this failure, so it needs a human or your own coding agent.`,
        '',
        '```',
        excerpt,
        '```',
        '',
        `Upgrade guide: ${guideUrl}`,
      ].join('\n'),
      agentPrompt: buildAgentPrompt({ title, stage: v.stage, files, excerpt, guideUrl, ...(opts.hop ? { hop: opts.hop } : {}) }),
    };
  });
}
