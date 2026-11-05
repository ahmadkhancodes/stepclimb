import type { Severity, Squawk } from '../types';

export interface MakeSquawkInput {
  severity: Severity;
  file?: string;
  line?: number;
  title: string;
  body: string;
  docUrl?: string;
  failingOutput?: string;
}

const MAX_OUTPUT = 4000;
const DEFAULT_DOC = 'https://laravel.com/docs/master/upgrade';

/** Builds a squawk with a templated, ready to paste prompt for the customer's own agent. No AI call. */
export function makeSquawk(i: MakeSquawkInput): Squawk {
  const where = i.file ? (i.line ? `${i.file}:${i.line}` : i.file) : 'the repository (no single file)';
  const doc = i.docUrl ?? DEFAULT_DOC;
  const out = i.failingOutput?.trim();
  const clipped = out ? (out.length > MAX_OUTPUT ? out.slice(0, MAX_OUTPUT) + '\n[output truncated]' : out) : '';
  const lines = [
    'You are working in a Laravel repository on a branch prepared by Stepclimb by BufferSol.',
    `Task: ${i.title}`,
    `Where: ${where}`,
    `Upgrade guide: ${doc}`,
    '',
    'What Stepclimb found:',
    i.body.trim(),
  ];
  if (clipped) lines.push('', 'Failing output:', '```', clipped, '```');
  lines.push(
    '',
    'Instructions: make the smallest change that resolves this, following the upgrade guide above. Do not touch unrelated files. Run the test suite afterwards and report what you changed.',
  );
  const bodyMd = [i.body.trim(), i.file ? `\nFile: \`${where}\`` : '', `\n[Upgrade guide](${doc})`, clipped ? `\n\`\`\`\n${clipped}\n\`\`\`` : ''].join('');
  return { severity: i.severity, file: i.file, line: i.line, title: i.title, bodyMd, agentPrompt: lines.join('\n') };
}
