import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MemoryFs } from '../vfs';
import { applyRecipe, loadRecipes, makeSquawk, planHop, planHops, runPlan, validateRecipe, buildRectorConfig, type Recipe } from './index';

const RECIPES_DIR = resolve(process.cwd(), 'recipes');
const catalog = loadRecipes(RECIPES_DIR);
const byKey = (k: string): Recipe => {
  const r = catalog.find((x) => x.key === k);
  if (!r) throw new Error(`missing recipe ${k}`);
  return r;
};

const L11_LIVEWIRE_PEST = `{
    "name": "acme/portal",
    "type": "project",
    "require": {
        "php": "^8.2",
        "laravel/framework": "^11.9",
        "laravel/tinker": "^2.9",
        "livewire/livewire": "^3.5"
    },
    "require-dev": {
        "fakerphp/faker": "^1.23",
        "laravel/pint": "^1.13",
        "nunomaduro/collision": "^8.1",
        "pestphp/pest": "^2.34",
        "pestphp/pest-plugin-laravel": "^2.4"
    },
    "config": {
        "sort-packages": true
    }
}
`;
const L11_API = `{
    "name": "acme/api",
    "require": {
        "php": "^8.2",
        "laravel/framework": "^11.0",
        "laravel/sanctum": "^4.0"
    },
    "require-dev": {
        "phpunit/phpunit": "^11.0.1",
        "nunomaduro/collision": "^8.1"
    }
}
`;
// 2 space indent, CRLF, escaped slashes, no trailing newline, compact inline array
const L11_ODD = '{\r\n  "name": "acme\\/odd",\r\n  "keywords": ["a", "b"],\r\n  "require": {\r\n    "php": ">=8.1",\r\n    "laravel\\/framework": "11.*"\r\n  },\r\n  "require-dev": {\r\n    "phpunit\\/phpunit": "^10.5"\r\n  }\r\n}';
const L12_DONE = `{
    "require": {
        "php": "^8.2",
        "laravel/framework": "^12.0"
    },
    "require-dev": {
        "phpunit/phpunit": "^11.0",
        "pestphp/pest": "^3.0"
    }
}
`;
const L10_APP = `{
    "name": "acme/legacy",
    "require": {
        "php": "^8.1",
        "guzzlehttp/guzzle": "^7.2",
        "laravel/framework": "^10.10",
        "laravel/sanctum": "^3.2",
        "laravel/tinker": "^2.8",
        "livewire/livewire": "^3.0",
        "spatie/once": "^3.1"
    },
    "require-dev": {
        "doctrine/dbal": "^3.0",
        "nunomaduro/collision": "^7.0",
        "pestphp/pest": "^2.0",
        "phpunit/phpunit": "^10.1"
    }
}
`;

describe('catalog', () => {
  it('loads and validates every shipped recipe, with sources', () => {
    expect(catalog.map((r) => r.key).sort()).toEqual([
      'fixer.pint-conventions',
      'laravel-10-to-11.composer', 'laravel-10-to-11.skeleton',
      'laravel-11-to-12.composer', 'laravel-11-to-12.skeleton',
      'laravel-12-to-13.composer', 'laravel-12-to-13.csrf-rename', 'laravel-12-to-13.skeleton',
    ]);
    for (const r of catalog) expect(r.sources.length).toBeGreaterThan(0);
    expect(catalog.filter((r) => r.unverified).map((r) => r.key).sort()).toEqual(['fixer.pint-conventions', 'laravel-10-to-11.skeleton', 'laravel-12-to-13.csrf-rename']);
  });
  it('rejects bad recipes with clear errors', () => {
    const r = validateRecipe({ key: 'Bad Key', version: '1', pathKind: 'x', from: 10, engine: 'nope', title: '', params: 3, sources: ['ftp'] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const t = r.errors.join('\n');
      expect(t).toMatch(/key:/); expect(t).toMatch(/version:/); expect(t).toMatch(/pathKind:/); expect(t).toMatch(/engine:/);
      expect(t).toMatch(/to:/); expect(t).toMatch(/title:/); expect(t).toMatch(/params:/); expect(t).toMatch(/sources\[0\]/);
    }
  });
});

describe('composer_json engine golden fixtures', () => {
  it('Laravel 11 app with Livewire and Pest -> 12', () => {
    const fs = new MemoryFs({ 'composer.json': L11_LIVEWIRE_PEST });
    const res = applyRecipe(byKey('laravel-11-to-12.composer'), fs);
    expect(res.noop).toBe(false);
    expect(res.changedFiles).toEqual(['composer.json']);
    expect(res.commitMessage).toBe('Stepclimb: laravel-11-to-12.composer@1.0.0 Update composer.json for Laravel 12');
    expect(fs.read('composer.json')).toBe(L11_LIVEWIRE_PEST.replace('"^11.9"', '"^12.0"').replace('"^2.34"', '"^3.0"'));
    // tinker and pint are installed but unverified: reported, not changed
    expect(res.squawks.map((s) => s.title).sort()).toEqual(['Verify laravel/pint for 12', 'Verify laravel/tinker for 12', 'Verify nunomaduro/collision for 12']);
    expect(res.squawks.every((s) => s.agentPrompt.includes('https://laravel.com/docs/12.x/upgrade'))).toBe(true);
  });
  it('API only app: already satisfied constraints stay untouched', () => {
    const fs = new MemoryFs({ 'composer.json': L11_API });
    const res = applyRecipe(byKey('laravel-11-to-12.composer'), fs);
    expect(fs.read('composer.json')).toBe(L11_API.replace('"laravel/framework": "^11.0"', '"laravel/framework": "^12.0"'));
    expect(res.changedFiles).toEqual(['composer.json']);
    expect(fs.read('composer.json')).toContain('"phpunit/phpunit": "^11.0.1"');
    expect(fs.read('composer.json')).toContain('"laravel/sanctum": "^4.0"');
  });
  it('unusual formatting: 2 spaces, CRLF, escaped slashes, no trailing newline', () => {
    const fs = new MemoryFs({ 'composer.json': L11_ODD });
    const res = applyRecipe(byKey('laravel-11-to-12.composer'), fs);
    expect(res.noop).toBe(false);
    const out = fs.read('composer.json')!;
    expect(out).toContain('"php": "^8.2"');
    expect(out).toContain('"laravel\\/framework": "^12.0"');
    expect(out).toContain('"phpunit\\/phpunit": "^11.0"');
    expect(out).toContain('\r\n  "require"');
    expect(out).not.toMatch(/[^\r]\n/);
    expect(out.endsWith('}')).toBe(true);
    expect(JSON.parse(out).keywords).toEqual(['a', 'b']);
  });
  it('already on target is a noop and writes nothing', () => {
    const fs = new MemoryFs({ 'composer.json': L12_DONE });
    const res = applyRecipe(byKey('laravel-11-to-12.composer'), fs);
    expect(res.noop).toBe(true);
    expect(res.changedFiles).toEqual([]);
    expect(fs.read('composer.json')).toBe(L12_DONE);
  });
  it('is idempotent without relying on the guard', () => {
    const recipe: Recipe = { ...byKey('laravel-11-to-12.composer'), guard: undefined };
    const fs = new MemoryFs({ 'composer.json': L11_LIVEWIRE_PEST });
    expect(applyRecipe(recipe, fs).noop).toBe(false);
    const after = fs.read('composer.json');
    expect(applyRecipe(recipe, fs).noop).toBe(true);
    expect(fs.read('composer.json')).toBe(after);
  });
  it('never touches composer.lock', () => {
    const fs = new MemoryFs({ 'composer.json': L11_API, 'composer.lock': '{"lock":true}' });
    applyRecipe(byKey('laravel-11-to-12.composer'), fs);
    expect(fs.read('composer.lock')).toBe('{"lock":true}');
  });
  it('supports remove and replace and monorepo appPath', () => {
    const r: Recipe = { key: 'x.composer', version: '1.0.0', pathKind: 'php', from: '1', to: '2', engine: 'composer_json', title: 't', summary: 's', sources: ['https://example.com'], params: { remove: [{ name: 'a/old' }], replace: [{ from: 'b/old', to: 'b/new', constraint: '^2.0' }] } };
    const fs = new MemoryFs({ 'apps/web/composer.json': '{\n    "require": {\n        "a/old": "^1.0",\n        "b/old": "^1.0",\n        "c/keep": "^1.0"\n    }\n}\n' });
    const res = applyRecipe(r, fs, { appPath: 'apps/web' });
    expect(res.changedFiles).toEqual(['apps/web/composer.json']);
    expect(Object.keys(JSON.parse(fs.read('apps/web/composer.json')!).require)).toEqual(['b/new', 'c/keep']);
  });
  it('reports a squawk for invalid JSON instead of throwing', () => {
    const res = applyRecipe({ ...byKey('laravel-11-to-12.composer'), guard: undefined }, new MemoryFs({ 'composer.json': '{ nope' }), {});
    expect(res.squawks[0]?.severity).toBe('must_fix');
  });
});

describe('unverified recipes', () => {
  it('emit review squawks and change nothing', () => {
    const fs = new MemoryFs({ 'bootstrap/app.php': '<?php\n' });
    const res = applyRecipe(byKey('laravel-12-to-13.csrf-rename'), fs);
    expect(res.noop).toBe(true);
    expect(res.squawks[0]?.severity).toBe('review');
    const sk = applyRecipe(byKey('laravel-10-to-11.skeleton'), fs, { skeleton: { from: {}, to: {} } });
    expect(sk.noop).toBe(true);
    expect(sk.squawks[0]?.severity).toBe('review');
    const pint = applyRecipe(byKey('fixer.pint-conventions'), fs);
    expect(pint.squawks).toHaveLength(1);
  });
  it('10 -> 11 leaves unverified phpunit and pest alone', () => {
    const fs = new MemoryFs({ 'composer.json': L10_APP });
    const res = applyRecipe(byKey('laravel-10-to-11.composer'), fs);
    const j = JSON.parse(fs.read('composer.json')!);
    expect(j['require-dev']['phpunit/phpunit']).toBe('^10.1');
    expect(j.require['laravel/framework']).toBe('^11.0');
    expect(j.require.php).toBe('^8.2');
    expect(j.require['laravel/sanctum']).toBe('^4.0');
    expect(j.require['spatie/once']).toBeUndefined();
    expect(j['require-dev']['doctrine/dbal']).toBe('^3.0');
    expect(res.squawks.some((s) => s.title.includes('Sanctum migrations') && s.severity === 'must_fix')).toBe(true);
  });
});

describe('skeleton_diff engine', () => {
  const recipe = byKey('laravel-12-to-13.skeleton');
  const SESSION_BASE = ['<?php', "return [", "    'driver' => env('SESSION_DRIVER', 'database'),", "    'lifetime' => 120,", '    // a', '    // b', '    // c', '    // d', "    'serialization' => 'php',", '];', ''].join('\n');
  const SESSION_THEIRS = SESSION_BASE.replace("'serialization' => 'php'", "'serialization' => 'json'");
  const SESSION_OURS = SESSION_BASE.replace("'lifetime' => 120", "'lifetime' => 30");

  it('clean merge writes, adds a note, and is idempotent', () => {
    const fs = new MemoryFs({ artisan: 'x', 'bootstrap/app.php': 'y', 'config/session.php': SESSION_OURS });
    const ctx = { skeleton: { from: { 'config/session.php': SESSION_BASE }, to: { 'config/session.php': SESSION_THEIRS } } };
    const res = applyRecipe(recipe, fs, ctx);
    expect(res.changedFiles).toEqual(['config/session.php']);
    const merged = fs.read('config/session.php')!;
    expect(merged).toContain("'lifetime' => 30");
    expect(merged).toContain("'serialization' => 'json'");
    expect(res.squawks.map((s) => s.title)).toEqual(['Session serialization changed to json']);
    const again = applyRecipe(recipe, fs, ctx);
    expect(again.noop).toBe(true);
    expect(fs.read('config/session.php')).toBe(merged);
  });
  it('conflict keeps ours and raises a must_fix squawk with the hunks', () => {
    const base = '<?php\n\nreturn Application::configure()\n    ->withRouting(web: __DIR__.\'/../routes/web.php\')\n    ->create();\n';
    const theirs = base.replace("web: __DIR__.'/../routes/web.php'", "web: __DIR__.'/../routes/web.php', health: '/up'");
    const ours = base.replace("web: __DIR__.'/../routes/web.php'", "web: __DIR__.'/../routes/web.php', api: __DIR__.'/../routes/api.php'");
    const fs = new MemoryFs({ artisan: 'x', 'bootstrap/app.php': ours });
    const res = applyRecipe(recipe, fs, { skeleton: { from: { 'bootstrap/app.php': base }, to: { 'bootstrap/app.php': theirs } } });
    expect(fs.read('bootstrap/app.php')).toBe(ours);
    expect(res.changedFiles).toEqual([]);
    expect(res.noop).toBe(true);
    const sq = res.squawks[0]!;
    expect(sq.severity).toBe('must_fix');
    expect(sq.file).toBe('bootstrap/app.php');
    expect(sq.line).toBe(4);
    expect(sq.bodyMd).toContain("health: '/up'");
    expect(sq.bodyMd).toContain("api: __DIR__");
    expect(sq.agentPrompt).toContain('bootstrap/app.php:4');
  });
  it('without skeleton files raises a review squawk', () => {
    const res = applyRecipe(recipe, new MemoryFs({ artisan: '#!/usr/bin/env php', 'bootstrap/app.php': '' }), {});
    expect(res.noop).toBe(true);
    expect(res.squawks[0]?.severity).toBe('review');
  });
  it('adds files that are new upstream', () => {
    const fs = new MemoryFs({ artisan: 'x', 'bootstrap/app.php': 'y' });
    const res = applyRecipe(recipe, fs, { skeleton: { from: {}, to: { 'bootstrap/providers.php': '<?php\n' } } });
    expect(res.changedFiles).toEqual(['bootstrap/providers.php']);
  });
});

describe('file_patch engine', () => {
  const r: Recipe = { key: 'x.patch', version: '1.0.0', pathKind: 'php', from: '1', to: '2', engine: 'file_patch', title: 'Patch', summary: 's', sources: ['https://example.com'], params: { files: [
    { path: 'app/a.php', replacements: [
      { find: 'OldClass', replace: 'NewClass' },
      { type: 'regex', find: 'use\\s+Foo\\\\Bar;', replace: 'use Foo\\Baz;', ifNotContains: 'Foo\\Baz' },
    ] },
    { path: 'missing.php', replacements: [{ find: 'a', replace: 'b' }] },
  ] } };
  it('replaces with guards and is idempotent', () => {
    const fs = new MemoryFs({ 'app/a.php': '<?php\nuse Foo\\Bar;\nnew OldClass(); new OldClass();\n' });
    const res = applyRecipe(r, fs);
    expect(fs.read('app/a.php')).toBe('<?php\nuse Foo\\Baz;\nnew NewClass(); new NewClass();\n');
    expect(res.changedFiles).toEqual(['app/a.php']);
    expect(res.squawks[0]?.severity).toBe('note');
    expect(applyRecipe(r, fs).noop).toBe(true);
  });
});

describe('external engines return steps and never execute', () => {
  const base = { version: '1.0.0', pathKind: 'laravel' as const, from: '11', to: '12', title: 'T', summary: 'S', sources: ['https://example.com'] };
  it('rector', () => {
    const r: Recipe = { ...base, key: 'x.rector', engine: 'rector', params: { rules: ['RectorLaravel\\Rector\\Foo\\BarRector'], paths: ['app'] } };
    const res = applyRecipe(r, new MemoryFs());
    expect(res.noop).toBe(false);
    expect(res.changedFiles).toEqual([]);
    const step = res.externalSteps.find((s) => s.kind === 'rector')!;
    expect(step.command.slice(0, 2)).toEqual(['vendor/bin/rector', 'process']);
    expect(step.files!['.stepclimb/rector.php']).toBe(buildRectorConfig({ rules: ['RectorLaravel\\Rector\\Foo\\BarRector'], paths: ['app'] }));
    expect(step.files!['.stepclimb/rector.php']).toContain("->withRules([\\RectorLaravel\\Rector\\Foo\\BarRector::class]);");
    expect(res.externalSteps[0]?.kind).toBe('composer');
  });
  it('php_parser and npm_codemod', () => {
    const p = applyRecipe({ ...base, key: 'x.parser', engine: 'php_parser', params: { script: '<?php echo 1;' } }, new MemoryFs(), { appPath: 'sub' });
    expect(p.externalSteps[0]).toMatchObject({ kind: 'php_parser', cwd: 'sub', command: ['php', '.stepclimb/x.parser.php'], files: { 'sub/.stepclimb/x.parser.php': '<?php echo 1;' } });
    const n = applyRecipe({ ...base, key: 'x.npm', engine: 'npm_codemod', params: { package: '@tailwindcss/upgrade', args: ['--force'] } }, new MemoryFs());
    expect(n.externalSteps[0]?.command).toEqual(['npx', '--yes', '@tailwindcss/upgrade', '--force']);
  });
});

describe('planning and running', () => {
  it('plans 10 -> 13 as three hops, composer first', () => {
    const hops = planHops({ laravelMajor: 10, testFramework: 'pest' }, 10, 13, catalog);
    expect(hops.map((h) => `${h.from}->${h.to}`)).toEqual(['10->11', '11->12', '12->13']);
    expect(hops.map((h) => h.recipes[0]!.key)).toEqual(['laravel-10-to-11.composer', 'laravel-11-to-12.composer', 'laravel-12-to-13.composer']);
    const flat = planHop({ laravelMajor: 10 }, 10, 13, catalog);
    expect(flat).toHaveLength(7);
    expect(planHop({ laravelMajor: 12 }, 12, 13, catalog).map((r) => r.key)).toEqual(['laravel-12-to-13.composer', 'laravel-12-to-13.skeleton', 'laravel-12-to-13.csrf-rename']);
  });
  it('throws when a hop has no recipes', () => {
    expect(() => planHop({}, 13, 14, catalog)).toThrow(/no composer_json recipe/);
    expect(() => planHop({}, 12, 12, catalog)).toThrow(/invalid hop/);
  });
  it('picks the highest version of a key', () => {
    const newer = { ...byKey('laravel-11-to-12.composer'), version: '1.1.0' };
    const flat = planHop({}, 11, 12, [...catalog, newer]);
    expect(flat.filter((r) => r.key === 'laravel-11-to-12.composer').map((r) => r.version)).toEqual(['1.1.0']);
  });
  it('runs the 10 -> 13 chain sequentially and a second run is all noop', () => {
    const fs = new MemoryFs({ 'composer.json': L10_APP, 'composer.lock': '{}' });
    const plan = planHop({ laravelMajor: 10 }, 10, 13, catalog);
    const first = runPlan(plan, fs);
    const j = JSON.parse(fs.read('composer.json')!);
    expect(j.require).toMatchObject({ php: '^8.3', 'laravel/framework': '^13.0', 'laravel/tinker': '^3.0', 'laravel/sanctum': '^4.0', 'livewire/livewire': '^3.4' });
    expect(j['require-dev']).toMatchObject({ 'phpunit/phpunit': '^12.0', 'pestphp/pest': '^4.0', 'nunomaduro/collision': '^8.1' });
    expect(first.filter((r) => r.changedFiles.length).map((r) => r.recipeKey)).toEqual(['laravel-10-to-11.composer', 'laravel-11-to-12.composer', 'laravel-12-to-13.composer']);
    expect(fs.read('composer.lock')).toBe('{}');
    const snapshot = fs.snapshot();
    const second = runPlan(plan, fs);
    expect(second.every((r) => r.noop)).toBe(true);
    expect(fs.snapshot()).toEqual(snapshot);
  });
});

describe('makeSquawk', () => {
  it('templates the agent prompt without any AI call', () => {
    const s = makeSquawk({ severity: 'must_fix', file: 'app/Foo.php', line: 12, title: 'Fix Foo', body: 'Method removed.', docUrl: 'https://laravel.com/docs/13.x/upgrade', failingOutput: 'Call to undefined method' });
    expect(s.severity).toBe('must_fix');
    expect(s.agentPrompt).toContain('app/Foo.php:12');
    expect(s.agentPrompt).toContain('https://laravel.com/docs/13.x/upgrade');
    expect(s.agentPrompt).toContain('Call to undefined method');
    expect(s.bodyMd).toContain('Method removed.');
    expect(makeSquawk({ severity: 'note', title: 't', body: 'b', failingOutput: 'x'.repeat(9000) }).agentPrompt.length).toBeLessThan(5000);
  });
});
