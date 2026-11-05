import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { MemoryFs } from '../vfs.js';
import {
  expandParams, loadRules, matchFailure, planFix, redactSecrets, runRepairLoop, shannonEntropy,
  signatureOf, squawksFromFailure, validateRule, EXCERPT_CAP, parseFileRefs,
  type Rule, type VerifyResult,
} from './index.js';

const RULES_DIR = resolve(process.cwd(), 'repair-rules');
const rules = loadRules(RULES_DIR);
const byKey = (k: string) => rules.find((r) => r.key === k)!;

const composerJson = (req: Record<string, string>, dev: Record<string, string> = {}) =>
  JSON.stringify({ name: 'acme/portal', require: req, 'require-dev': dev }, null, 4) + '\n';

function problem(...lines: string[]) {
  return ['Your requirements could not be resolved to an installable set of packages.', '', '  Problem 1', ...lines.map((l) => `    - ${l}`), ''].join('\n');
}

interface Golden { key: string; files: Record<string, string>; output: string; expectFile: string; expectContains: string; major: number }
const goldens: Golden[] = [
  { key: 'composer.laravel-11-php-8-2', major: 11, files: { 'composer.json': composerJson({ php: '^8.1', 'laravel/framework': '^11.0' }) },
    output: problem('laravel/framework[v11.0.0, ..., v11.9.0] require php ^8.2 -> your php version (8.1.27) does not satisfy that requirement.'),
    expectFile: 'composer.json', expectContains: '"php": "^8.2"' },
  { key: 'composer.sanctum-4', major: 11, files: { 'composer.json': composerJson({ 'laravel/sanctum': '^3.3', 'laravel/framework': '^11.0' }) },
    output: problem('Root composer.json requires laravel/sanctum ^3.3 -> satisfiable by laravel/sanctum[v3.3.0, ..., v3.3.3].', 'laravel/framework v11.0.0 conflicts with laravel/sanctum v3.3.3.'),
    expectFile: 'composer.json', expectContains: '"laravel/sanctum": "^4.0"' },
  { key: 'composer.passport-12', major: 11, files: { 'composer.json': composerJson({ 'laravel/passport': '^11.10' }) },
    output: problem('Root composer.json requires laravel/passport ^11.10 -> satisfiable by laravel/passport[v11.10.0] but these conflict with your requirements or minimum-stability.'),
    expectFile: 'composer.json', expectContains: '"laravel/passport": "^12.0"' },
  { key: 'composer.cashier-15', major: 11, files: { 'composer.json': composerJson({ 'laravel/cashier': '^14.0' }) },
    output: problem('Root composer.json requires laravel/cashier ^14.0 -> satisfiable by laravel/cashier[v14.0.0] but these conflict with your requirements or minimum-stability.'),
    expectFile: 'composer.json', expectContains: '"laravel/cashier": "^15.0"' },
  { key: 'composer.telescope-5', major: 11, files: { 'composer.json': composerJson({}, { 'laravel/telescope': '^4.17' }) },
    output: problem('Root composer.json requires laravel/telescope ^4.17 -> satisfiable by laravel/telescope[v4.17.0] but these conflict with your requirements or minimum-stability.'),
    expectFile: 'composer.json', expectContains: '"laravel/telescope": "^5.0"' },
  { key: 'composer.collision-8', major: 11, files: { 'composer.json': composerJson({}, { 'nunomaduro/collision': '^7.0' }) },
    output: problem('Root composer.json requires nunomaduro/collision ^7.0 -> satisfiable by nunomaduro/collision[v7.0.0] but these conflict with your requirements or minimum-stability.'),
    expectFile: 'composer.json', expectContains: '"nunomaduro/collision": "^8.1"' },
  { key: 'composer.livewire-3-4', major: 11, files: { 'composer.json': composerJson({ 'livewire/livewire': '^3.0' }) },
    output: problem('Root composer.json requires livewire/livewire ^3.0 -> satisfiable by livewire/livewire[v3.0.0] but these conflict with your requirements or minimum-stability.'),
    expectFile: 'composer.json', expectContains: '"livewire/livewire": "^3.4"' },
  { key: 'composer.inertia-laravel-1', major: 11, files: { 'composer.json': composerJson({ 'inertiajs/inertia-laravel': '^0.6.11' }) },
    output: problem('Root composer.json requires inertiajs/inertia-laravel ^0.6.11 -> satisfiable by inertiajs/inertia-laravel[v0.6.11] but these conflict with your requirements or minimum-stability.'),
    expectFile: 'composer.json', expectContains: '"inertiajs/inertia-laravel": "^1.0"' },
  { key: 'tests.phpunit-11', major: 12, files: { 'composer.json': composerJson({}, { 'phpunit/phpunit': '^10.5' }) },
    output: problem('Root composer.json requires phpunit/phpunit ^10.5 -> satisfiable by phpunit/phpunit[10.5.0] but these conflict with your requirements or minimum-stability.'),
    expectFile: 'composer.json', expectContains: '"phpunit/phpunit": "^11.0"' },
  { key: 'tests.pest-3', major: 12, files: { 'composer.json': composerJson({}, { 'pestphp/pest': '^2.34' }) },
    output: problem('Root composer.json requires pestphp/pest ^2.34 -> satisfiable by pestphp/pest[v2.34.0] but these conflict with your requirements or minimum-stability.'),
    expectFile: 'composer.json', expectContains: '"pestphp/pest": "^3.0"' },
  { key: 'tests.phpunit-12', major: 13, files: { 'composer.json': composerJson({}, { 'phpunit/phpunit': '^11.0' }) },
    output: problem('Root composer.json requires phpunit/phpunit ^11.0 -> satisfiable by phpunit/phpunit[11.0.0] but these conflict with your requirements or minimum-stability.'),
    expectFile: 'composer.json', expectContains: '"phpunit/phpunit": "^12.0"' },
  { key: 'tests.pest-4', major: 13, files: { 'composer.json': composerJson({}, { 'pestphp/pest': '^3.0' }) },
    output: problem('Root composer.json requires pestphp/pest ^3.0 -> satisfiable by pestphp/pest[v3.0.0] but these conflict with your requirements or minimum-stability.'),
    expectFile: 'composer.json', expectContains: '"pestphp/pest": "^4.0"' },
  { key: 'composer.spatie-once-remove', major: 11, files: { 'composer.json': composerJson({ 'spatie/once': '^3.1', 'laravel/framework': '^11.0' }) },
    output: 'PHP Fatal error:  Cannot redeclare once() (previously declared in vendor/laravel/framework/src/Illuminate/Support/helpers.php:432) in vendor/spatie/once/src/functions.php on line 4',
    expectFile: 'composer.json', expectContains: '"laravel/framework"' },
  { key: 'build.sanctum-middleware-config', major: 11,
    files: { 'config/sanctum.php': "<?php\nreturn [\n    'middleware' => [\n        'authenticate_session' => Laravel\\Sanctum\\Http\\Middleware\\AuthenticateSession::class,\n        'encrypt_cookies' => App\\Http\\Middleware\\EncryptCookies::class,\n        'verify_csrf_token' => App\\Http\\Middleware\\VerifyCsrfToken::class,\n    ],\n];\n" },
    output: 'Error: Class "App\\Http\\Middleware\\VerifyCsrfToken" not found at /home/runner/work/portal/portal/config/sanctum.php:80',
    expectFile: 'config/sanctum.php', expectContains: "'validate_csrf_token' => Illuminate\\Foundation\\Http\\Middleware\\ValidateCsrfToken::class," },
];

describe('rule library', () => {
  it('loads 12 to 15 valid rules with sources and a version', () => {
    expect(rules.length).toBeGreaterThanOrEqual(12);
    expect(rules.length).toBeLessThanOrEqual(15);
    for (const r of rules) {
      expect(r.sources.length).toBeGreaterThan(0);
      expect(r.sources.every((s) => s.startsWith('https://laravel.com/docs/'))).toBe(true);
    }
  });
  it('every rule with unverified:false is documented as such (flag present on all rules)', () => {
    expect(rules.every((r) => typeof r.unverified === 'boolean')).toBe(true);
  });

  for (const g of goldens) {
    it(`golden: ${g.key}`, () => {
      const fs = new MemoryFs(g.files);
      const ms = matchFailure(g.output, rules, { targetMajor: g.major, fs });
      expect(ms.map((m) => m.rule.key)).toContain(g.key);
      const m = ms.find((x) => x.rule.key === g.key)!;
      const plan = planFix(m, fs);
      expect(plan.applicable).toBe(true);
      if (g.key === 'composer.spatie-once-remove') {
        expect(fs.read('composer.json')).not.toContain('spatie/once');
      }
      expect(fs.read(g.expectFile)).toContain(g.expectContains);
      expect(plan.changedFiles).toEqual([g.expectFile]);
      // idempotent
      const again = planFix(m, fs);
      expect(again.changedFiles).toEqual([]);
    });
  }

  it('golden: php.csrf-middleware-renamed returns a rector step', () => {
    const out = 'WARN  Illuminate\\Foundation\\Http\\Middleware\\VerifyCsrfToken is deprecated, use PreventRequestForgery';
    const fs = new MemoryFs({ 'app/Foo.php': '<?php' });
    const ms = matchFailure(out, rules, { targetMajor: 13, fs });
    const plan = planFix(ms.find((m) => m.rule.key === 'php.csrf-middleware-renamed')!, fs);
    expect(plan.changedFiles).toEqual([]);
    expect(plan.externalSteps).toHaveLength(1);
    const step = plan.externalSteps[0]!;
    expect(step.kind).toBe('rector');
    const cfg = step.files!['rector.stepclimb-repair.php']!;
    expect(cfg).toContain('withConfiguredRule(\\Rector\\Renaming\\Rector\\Name\\RenameClassRector::class');
    expect(cfg).toContain("'Illuminate\\\\Foundation\\\\Http\\\\Middleware\\\\VerifyCsrfToken' => 'Illuminate\\\\Foundation\\\\Http\\\\Middleware\\\\PreventRequestForgery'");
  });

  it('guard blocks a bump when composer.json already satisfies the target', () => {
    const fs = new MemoryFs({ 'composer.json': composerJson({ 'laravel/sanctum': '^3.3|^4.0' }) });
    expect(matchFailure(goldens[1]!.output, rules, { targetMajor: 11, fs })).toEqual([]);
    const ok = new MemoryFs({ 'composer.json': composerJson({ 'laravel/sanctum': '^4.0' }) });
    expect(matchFailure(goldens[1]!.output, rules, { targetMajor: 11, fs: ok })).toEqual([]);
  });

  it('version filter keeps the 12 and 13 phpunit rules apart', () => {
    const out = goldens.find((g) => g.key === 'tests.phpunit-11')!.output;
    const fs = new MemoryFs({ 'composer.json': composerJson({}, { 'phpunit/phpunit': '^10.5' }) });
    expect(matchFailure(out, rules, { targetMajor: 12, fs }).map((m) => m.rule.key)).toEqual(['tests.phpunit-11']);
    expect(matchFailure(out, rules, { targetMajor: 13, fs }).map((m) => m.rule.key)).toEqual(['tests.phpunit-12']);
  });

  it('composer.json formatting is preserved (indent, trailing newline)', () => {
    const fs = new MemoryFs({ 'composer.json': composerJson({ 'laravel/sanctum': '^3.3' }) });
    const m = matchFailure(goldens[1]!.output, rules, { targetMajor: 11, fs })[0]!;
    planFix(m, fs);
    const after = fs.read('composer.json')!;
    expect(after.endsWith('\n')).toBe(true);
    expect(after).toContain('\n        "laravel/sanctum": "^4.0"');
  });
});

describe('validateRule', () => {
  const good = () => ({
    key: 'composer.x-y', category: 'composer', version: 11, title: 't', signature: 'abc',
    fix: { kind: 'composer_constraint', params: { package: 'a/b', constraint: '^1.0' } }, sources: ['https://example.com/a'],
  });
  it('accepts a good rule', () => expect(validateRule(good()).ok).toBe(true));
  it('reports clear errors', () => {
    const bad = { ...good(), key: 'tests.x', signature: '(', category: 'nope', fix: { kind: 'magic', params: {} }, sources: [], extra: 1 };
    const r = validateRule(bad, 'bad.yaml');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const all = r.errors.join('\n');
      expect(all).toContain('bad.yaml: category: must be one of');
      expect(all).toContain('bad.yaml: signature: invalid regex');
      expect(all).toContain('bad.yaml: fix.kind: must be one of');
      expect(all).toContain('bad.yaml: sources: required non-empty');
      expect(all).toContain('bad.yaml: extra: unknown field');
    }
  });
  it('key prefix must equal category', () => {
    const r = validateRule({ ...good(), key: 'tests.x-y' });
    expect(r.ok).toBe(false);
  });
  it('validates params per kind', () => {
    const r = validateRule({ ...good(), fix: { kind: 'config_patch', params: { file: 'a' } } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain('fix.params.replace');
  });
});

describe('matchFailure / planFix kinds', () => {
  const mk = (over: Partial<Rule>): Rule => ({
    key: 'build.t', category: 'build', version: 'any', title: 't', signature: 'x', sources: ['https://e.com'],
    fix: { kind: 'file_template', params: { path: 'a.txt', content: 'hi' } }, ...over,
  });
  it('is deterministic and exposes capture groups', () => {
    const a = mk({ key: 'build.b', signature: 'boom (?<what>\\w+)' });
    const b = mk({ key: 'build.a', signature: 'boom (\\w+)' });
    const c = mk({ key: 'build.c', signature: 'early' });
    const out = 'early\nboom thing';
    const r1 = matchFailure(out, [a, b, c]);
    const r2 = matchFailure(out, [c, b, a]);
    expect(r1.map((m) => m.rule.key)).toEqual(['build.c', 'build.a', 'build.b']);
    expect(r2.map((m) => m.rule.key)).toEqual(r1.map((m) => m.rule.key));
    expect(r1[2]!.vars.what).toBe('thing');
    expect(r1[1]!.vars['1']).toBe('thing');
  });
  it('file_template writes with var expansion and respects overwrite', () => {
    const rule = mk({ signature: 'need (?<f>\\S+)', fix: { kind: 'file_template', params: { path: '${f}', content: 'v=${f}' } } });
    const fs = new MemoryFs();
    const m = matchFailure('need conf.ini', [rule])[0]!;
    expect(planFix(m, fs).changedFiles).toEqual(['conf.ini']);
    expect(fs.read('conf.ini')).toBe('v=conf.ini');
    fs.write('conf.ini', 'other');
    expect(planFix(m, fs).applicable).toBe(false);
  });
  it('php_parser_script returns an external step', () => {
    const rule = mk({ fix: { kind: 'php_parser_script', params: { id: 'rename', script: '<?php echo 1;', paths: ['app'] } } });
    const plan = planFix(matchFailure('x', [rule])[0]!, new MemoryFs());
    expect(plan.externalSteps[0]).toMatchObject({ kind: 'php_parser', command: ['php', '.stepclimb/repair/rename.php', 'app'] });
  });
  it('expandParams is deep', () => {
    expect(expandParams({ a: ['${x}', { b: 'p-${x}' }] }, { x: '1' })).toEqual({ a: ['1', { b: 'p-1' }] });
  });
});

describe('runRepairLoop', () => {
  const fail = (output: string, stage: VerifyResult['stage'] = 'composer'): VerifyResult => ({ passed: false, output, stage });
  const tpl = (n: number): Rule => ({
    key: `build.step-${n}`, category: 'build', version: 'any', title: `s${n}`, signature: `STEP${n}\\b`, sources: ['https://e.com'],
    fix: { kind: 'file_template', params: { path: `f${n}.txt`, content: String(n) } },
  });

  it('passes after fixes, with one Repair commit per loop', async () => {
    const fs = new MemoryFs({ 'composer.json': composerJson({ 'laravel/sanctum': '^3.3' }, { 'phpunit/phpunit': '^10.5' }) });
    const verify = async (f: MemoryFs): Promise<VerifyResult> => {
      const j = JSON.parse(f.read('composer.json')!);
      const lines: string[] = [];
      if (j.require['laravel/sanctum'] === '^3.3') lines.push('Root composer.json requires laravel/sanctum ^3.3 -> satisfiable by x');
      if (j['require-dev']['phpunit/phpunit'] === '^10.5') lines.push('Root composer.json requires phpunit/phpunit ^10.5 -> satisfiable by x');
      return lines.length ? fail(problem(...lines)) : { passed: true, output: '', stage: 'composer' };
    };
    const out = await runRepairLoop({ verify: (f) => verify(f as MemoryFs), rules, fs, hop: { from: 11, to: 12 } });
    // sanctum rule is version 11, so only phpunit applies for the 12 hop
    expect(out.passed).toBe(false);
    const out2 = await runRepairLoop({ verify: (f) => verify(f as MemoryFs), rules, fs: new MemoryFs({ 'composer.json': composerJson({ 'laravel/sanctum': '^3.3' }, { 'phpunit/phpunit': '^10.5' }) }) });
    expect(out2.passed).toBe(true);
    expect(out2.loops).toHaveLength(1);
    expect(out2.commits).toHaveLength(1);
    expect(out2.commits[0]!.message).toMatch(/^Repair: .*composer\.sanctum-4/);
    expect(out2.commits[0]!.changedFiles).toEqual(['composer.json']);
    expect(out2.appliedRuleKeys.sort()).toEqual(['composer.sanctum-4', 'tests.phpunit-11', 'tests.phpunit-12'].filter((k) => out2.appliedRuleKeys.includes(k)).sort());
    expect(out2.squawks).toEqual([]);
  });

  it('stops after 3 loops', async () => {
    const fs = new MemoryFs();
    let n = 0;
    const verify = async (f: MemoryFs) => fail(`STEP${Math.min(++n, 9)}`) && fail(`STEP${[1, 2, 3, 4, 5].find((i) => !f.exists(`f${i}.txt`))}`);
    const out = await runRepairLoop({ verify: (f) => verify(f as MemoryFs), rules: [1, 2, 3, 4, 5].map(tpl), fs });
    expect(out.loops).toHaveLength(3);
    expect(out.commits.map((c) => c.message)).toEqual(['Repair: build.step-1', 'Repair: build.step-2', 'Repair: build.step-3']);
    expect(out.stopReason).toBe('max_loops');
    expect(out.passed).toBe(false);
    expect(out.squawks.length).toBeGreaterThan(0);
  });

  it('respects a custom maxLoops', async () => {
    const out = await runRepairLoop({ verify: async (f) => fail(`STEP${[1, 2, 3].find((i) => !f.exists(`f${i}.txt`))}`), rules: [1, 2, 3].map(tpl), fs: new MemoryFs(), maxLoops: 1 });
    expect(out.loops).toHaveLength(1);
    expect(out.stopReason).toBe('max_loops');
  });

  it('stops when no rule matches and records the unmatched signature', async () => {
    let calls = 0;
    const out = await runRepairLoop({
      verify: async () => { calls++; return fail('PHP Parse error: syntax error in app/Foo.php on line 12', 'tests'); },
      rules, fs: new MemoryFs({ 'app/Foo.php': '<?php' }),
    });
    expect(calls).toBe(1);
    expect(out.stopReason).toBe('no_rule_matches');
    expect(out.commits).toEqual([]);
    expect(out.unmatchedSignatures).toEqual([signatureOf('PHP Parse error: syntax error in app/Foo.php on line 99')]);
    expect(out.squawks[0]).toMatchObject({ severity: 'must_fix', file: 'app/Foo.php', line: 12 });
  });

  it('never re-applies the same rule against the same file state', async () => {
    // fix is a no-op on content that cannot satisfy verify: after loop 1 the rule matches again but changes nothing
    const rule: Rule = { ...tpl(1) };
    let calls = 0;
    const out = await runRepairLoop({ verify: async () => { calls++; return fail('STEP1'); }, rules: [rule], fs: new MemoryFs() });
    expect(out.loops).toHaveLength(2);
    expect(out.commits).toHaveLength(1);
    expect(out.appliedRuleKeys).toEqual(['build.step-1']);
    expect(['all_matches_already_applied', 'no_effective_change']).toContain(out.stopReason);
    expect(calls).toBe(2);
  });

  it('guard: same rule on identical file hash is skipped even if its fix would report a change', async () => {
    // external-step rule: fs never changes, so second match must be skipped by the key+hash guard
    const rule: Rule = {
      key: 'php.ext', category: 'php', version: 'any', title: 'ext', signature: 'BOOM', sources: ['https://e.com'],
      fix: { kind: 'rector_rule', params: { rule: 'Rector\\X\\Y', paths: ['app'] } },
    };
    const out = await runRepairLoop({ verify: async () => fail('BOOM', 'build'), rules: [rule], fs: new MemoryFs({ 'app/a.php': '<?php' }) });
    expect(out.commits).toHaveLength(1);
    expect(out.commits[0]!.externalSteps).toHaveLength(1);
    expect(out.stopReason).toBe('all_matches_already_applied');
  });
});

describe('squawks and prompts', () => {
  it('caps and redacts the excerpt, includes files and the guide link', () => {
    const secret = 'sk_live_' + 'a1B2c3D4e5F6g7H8i9J0';
    const output = `Error in app/Services/Billing.php:57\n${'x'.repeat(9000)}\nSTRIPE_KEY=${secret}\n`;
    const fs = new MemoryFs({ 'app/Services/Billing.php': '<?php' });
    const [s] = squawksFromFailure({ passed: false, output, stage: 'tests' }, { fs, hop: { from: 11, to: 12 } });
    expect(s!.file).toBe('app/Services/Billing.php');
    expect(s!.line).toBe(57);
    expect(s!.agentPrompt).toContain('https://laravel.com/docs/12.x/upgrade');
    expect(s!.agentPrompt).toContain('app/Services/Billing.php:57');
    expect(s!.agentPrompt).toContain('Laravel 11.x to 12.x');
    expect(s!.agentPrompt).not.toContain(secret);
    const m = /```\n([\s\S]*?)\n```/.exec(s!.agentPrompt)!;
    expect(m[1]!.length).toBeLessThanOrEqual(EXCERPT_CAP);
  });
  it('splits composer problems into separate squawks', () => {
    const out = 'Your requirements could not be resolved.\n\n  Problem 1\n    - A\n  Problem 2\n    - B\n';
    expect(squawksFromFailure({ passed: false, output: out, stage: 'composer' })).toHaveLength(2);
  });
  it('parses file refs in several formats', () => {
    const refs = parseFileRefs('at /home/ci/work/app/Models/User.php:42\nin /home/ci/work/routes/web.php on line 9\nhttps://x.com/a.json');
    expect(refs).toEqual([{ file: 'home/ci/work/app/Models/User.php', line: 42 }, { file: 'home/ci/work/routes/web.php', line: 9 }].map((r) => ({ ...r, file: '/' + r.file })));
  });
});

describe('redactSecrets', () => {
  const R = redactSecrets;
  it('AWS keys', () => expect(R('id AKIAIOSFODNN7EXAMPLE x')).toBe('id [REDACTED:aws-access-key] x'));
  it('GitHub tokens', () => {
    expect(R('t=ghp_' + 'a'.repeat(36))).toContain('[REDACTED:github-token]');
    expect(R('ghs_' + 'B'.repeat(40))).toBe('[REDACTED:github-token]');
    expect(R('github_pat_11ABCDEFG0abcdefghijkl_mnopqrstuvwxyz0123456789')).toBe('[REDACTED:github-token]');
  });
  it('Stripe keys', () => {
    expect(R('sk_live_51Habcdefghijklmnop')).toBe('[REDACTED:stripe-key]');
    expect(R('sk_test_4eC39HqLyjWDarjtT1zdp7dc')).toBe('[REDACTED:stripe-key]');
  });
  it('private key blocks', () => {
    const t = 'a\n-----BEGIN RSA PRIVATE KEY-----\nMIIEow\nabc\n-----END RSA PRIVATE KEY-----\nb';
    expect(R(t)).toBe('a\n[REDACTED:private-key]\nb');
  });
  it('bearer tokens and url credentials', () => {
    expect(R('Authorization: Bearer abcdef0123456789.xyz')).toBe('Authorization: Bearer [REDACTED:bearer-token]');
    expect(R('https://user:hunter2@repo.packagist.com/x')).toBe('https://[REDACTED:url-credentials]@repo.packagist.com/x');
  });
  it('entropy rule fires for high entropy values on secret like names', () => {
    expect(R('APP_KEY=base64:Qk9oYWxsb1dvcmxkRXhhbXBsZUtleTEyMzQ1Njc4OTA=')).toContain('APP_KEY=base64:'); // ':' stops the value; short prefix
    expect(R('API_SECRET=9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08')).toBe('API_SECRET=[REDACTED:high-entropy]');
    expect(R('"password": "Zk3Qm9Xp2Lw8Vt5Ry7Nb4Hc6"')).toContain('[REDACTED:high-entropy]');
  });
  it('leaves low entropy and ordinary text alone', () => {
    expect(R('APP_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe('APP_KEY=aaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(R('SECRET_KEY_BASE=changeme_changeme_changeme')).toBe('SECRET_KEY_BASE=changeme_changeme_changeme');
    expect(R('Root composer.json requires laravel/sanctum ^3.3')).toBe('Root composer.json requires laravel/sanctum ^3.3');
    expect(R('TOKEN_LIMIT=100')).toBe('TOKEN_LIMIT=100');
  });
  it('entropy helper', () => {
    expect(shannonEntropy('aaaa')).toBe(0);
    expect(shannonEntropy('abcd')).toBeCloseTo(2);
  });
});

describe('signatureOf', () => {
  it('is stable across paths, line numbers, hashes, versions and counters', () => {
    const a = 'Problem 1\n  - laravel/framework v11.9.0 requires php ^8.2 -> your php version (8.1.27) does not satisfy\nError in /home/runner/work/a/app/Foo.php:12 commit 3f2a9c1d77\n';
    const b = 'Problem 2\n  - laravel/framework v11.31.0 requires php ^8.2 -> your php version (8.1.2) does not satisfy\nError in /tmp/x/y/app/Foo.php:340 commit aabbccd0912\n';
    expect(signatureOf(a)).toBe(signatureOf(b));
  });
  it('differs for different failures and keeps package names', () => {
    const s = signatureOf('Root composer.json requires laravel/sanctum ^3.3');
    expect(s).toContain('laravel/sanctum');
    expect(s).not.toBe(signatureOf('Root composer.json requires laravel/passport ^11.0'));
  });
  it('strips ANSI and secrets', () => {
    expect(signatureOf('\x1b[31mError\x1b[0m token ghp_' + 'z'.repeat(36))).not.toContain('ghp_');
  });
});
