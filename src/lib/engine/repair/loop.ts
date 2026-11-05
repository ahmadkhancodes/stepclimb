import { createHash } from 'node:crypto';
import type { VirtualFs } from '../vfs';
import type { ExternalStep } from '../types';
import { fixTargets, planFix } from './fix';
import { squawksFromFailure, type Hop } from './prompt';
import { matchFailure } from './rules';
import { signatureOf } from './signature';
import type { CommitDescriptor, LoopRecord, RepairOutcome, Rule, StopReason, VerifyResult } from './types';

export interface RepairLoopOptions {
  verify: (fs: VirtualFs) => Promise<VerifyResult>;
  rules: Rule[];
  fs: VirtualFs;
  maxLoops?: number;
  /** Laravel hop being verified; filters rules by version and feeds the upgrade guide link */
  hop?: Hop;
}

function hashFiles(fs: VirtualFs, files: string[]): string {
  const h = createHash('sha1');
  for (const f of files) h.update(`${f}\0${fs.read(f) ?? '<missing>'}\0`);
  return h.digest('hex');
}

export async function runRepairLoop(opts: RepairLoopOptions): Promise<RepairOutcome> {
  const { verify, rules, fs, hop } = opts;
  const maxLoops = opts.maxLoops ?? 3;
  const loops: LoopRecord[] = [];
  const commits: CommitDescriptor[] = [];
  const applied: string[] = [];
  /** rule key + hash of the files it touches, taken before applying */
  const guard = new Set<string>();
  const unmatched: string[] = [];

  let v = await verify(fs);
  let stopReason: StopReason = 'passed';

  while (!v.passed) {
    if (loops.length >= maxLoops) { stopReason = 'max_loops'; break; }
    const rec: LoopRecord = {
      loop: loops.length + 1,
      verify: { stage: v.stage, passed: false, signature: signatureOf(v.output) },
      matchedKeys: [], appliedKeys: [], skippedKeys: [],
    };
    const matches = matchFailure(v.output, rules, { fs, ...(hop ? { targetMajor: hop.to } : {}) });
    rec.matchedKeys = matches.map((m) => m.rule.key);
    if (matches.length === 0) {
      loops.push(rec);
      unmatched.push(rec.verify.signature);
      stopReason = 'no_rule_matches';
      break;
    }

    const changed = new Set<string>();
    const steps: ExternalStep[] = [];
    let guardSkips = 0;
    for (const m of matches) {
      const gk = `${m.rule.key}@${hashFiles(fs, fixTargets(m, fs))}`;
      if (guard.has(gk)) { rec.skippedKeys.push(m.rule.key); guardSkips++; continue; }
      guard.add(gk);
      const plan = planFix(m, fs);
      if (!plan.applicable || (plan.changedFiles.length === 0 && plan.externalSteps.length === 0)) { rec.skippedKeys.push(m.rule.key); continue; }
      rec.appliedKeys.push(m.rule.key);
      plan.changedFiles.forEach((f) => changed.add(f));
      steps.push(...plan.externalSteps);
    }
    loops.push(rec);

    if (rec.appliedKeys.length === 0) {
      stopReason = guardSkips === matches.length ? 'all_matches_already_applied' : 'no_effective_change';
      break;
    }
    const commit: CommitDescriptor = { message: `Repair: ${rec.appliedKeys.join(', ')}`, changedFiles: [...changed].sort(), externalSteps: steps };
    rec.commit = commit;
    commits.push(commit);
    applied.push(...rec.appliedKeys.filter((k) => !applied.includes(k)));
    v = await verify(fs);
  }

  const passed = v.passed;
  if (passed) stopReason = 'passed';
  return {
    passed,
    stopReason,
    loops,
    appliedRuleKeys: applied,
    commits,
    finalVerify: v,
    squawks: passed ? [] : squawksFromFailure(v, { fs, ...(hop ? { hop } : {}) }),
    unmatchedSignatures: unmatched,
  };
}
