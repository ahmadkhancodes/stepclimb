import { createHash } from 'node:crypto';
import { redactSecrets } from './redact.js';

const MAX_LINES = 8;

/** Stable normalised signature of a failure output: no paths, line numbers, hashes, versions or counters. */
export function signatureOf(output: string): string {
  const lines = redactSecrets(output)
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .split(/\r?\n/)
    .map(normaliseLine)
    .filter((l) => l.length > 0);
  const out: string[] = [];
  for (const l of lines) if (out[out.length - 1] !== l && !out.includes(l)) out.push(l);
  return out.slice(0, MAX_LINES).join('\n');
}

export function signatureId(output: string): string {
  return createHash('sha1').update(signatureOf(output)).digest('hex').slice(0, 12);
}

function normaliseLine(line: string): string {
  return line
    .replace(/(?:[A-Za-z]:)?[\w@.~/-]*\/[\w@.~/-]*/g, (m) => (isPackageName(m) ? m : '<path>'))
    .replace(/\b[\w-]+\.(?:php|json|lock|xml|neon|ya?ml|js|ts|vue)\b/g, '<file>')
    .replace(/(?:on )?line \d+/gi, 'line <n>')
    .replace(/:\d+(?::\d+)?\b/g, ':<n>')
    .replace(/\b(?=[0-9a-f]*\d)[0-9a-f]{7,64}\b/g, '<hash>')
    .replace(/[\^~]?v?\d+(?:\.\d+)+(?:-[\w.]+)?(?:\.\*)?/g, '<v>')
    .replace(/\b\d+\b/g, '<n>')
    .replace(/\s+/g, ' ')
    .trim();
}

const DIR_NAMES = /^(?:app|src|tests?|config|database|resources|routes|vendor|bootstrap|public|storage|home|tmp|var|usr|opt|work)\//;
function isPackageName(m: string): boolean {
  return /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(m) && !DIR_NAMES.test(m) && !/\.(?:php|json|lock|xml|neon|ya?ml|js|ts|vue)$/.test(m);
}
