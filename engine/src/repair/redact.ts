/** Secret redaction for any text that leaves the engine (excerpts, prompts, signatures). Pure. */

export function shannonEntropy(s: string): number {
  if (!s) return 0;
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

const PATTERNS: Array<[string, RegExp]> = [
  ['private-key', /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----|$)/g],
  ['aws-access-key', /\b(?:AKIA|ASIA|AGPA|AIDA|AROA)[0-9A-Z]{16}\b/g],
  ['github-token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/g],
  ['github-token', /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g],
  ['stripe-key', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{8,}\b/g],
  ['bearer-token', /\b(Bearer)\s+[A-Za-z0-9._~+/=-]{16,}/gi],
  ['url-credentials', /\b(https?:\/\/)[^\s/:@]+:[^\s/@]+@/g],
];

const NAMED_ASSIGNMENT =
  /([A-Za-z0-9_.-]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD)[A-Za-z0-9_.-]*["']?\s*(?:=|:|=>)\s*["']?)([A-Za-z0-9+/=_-]{20,})/gi;

export const ENTROPY_THRESHOLD = 3.3;

export function redactSecrets(text: string): string {
  let out = text;
  for (const [kind, re] of PATTERNS) {
    out = out.replace(re, (_m, g1?: string) => {
      if (kind === 'bearer-token') return `${g1} [REDACTED:${kind}]`;
      if (kind === 'url-credentials') return `${g1}[REDACTED:${kind}]@`;
      return `[REDACTED:${kind}]`;
    });
  }
  out = out.replace(NAMED_ASSIGNMENT, (m, prefix: string, value: string) =>
    shannonEntropy(value) >= ENTROPY_THRESHOLD ? `${prefix}[REDACTED:high-entropy]` : m,
  );
  return out;
}
