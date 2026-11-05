import semver from 'semver';
import type { DetectedApp, FrontendStack, TestFramework } from '../types.js';

export interface DetectInput {
  path: string;
  composerJson?: string;
  composerLock?: string;
  packageJson?: string;
}

type Dict = Record<string, unknown>;

function parseObj(s: string | undefined): { ok: boolean; value: Dict } {
  if (s === undefined) return { ok: true, value: {} };
  try {
    const v: unknown = JSON.parse(s);
    if (v && typeof v === 'object' && !Array.isArray(v)) return { ok: true, value: v as Dict };
    return { ok: false, value: {} };
  } catch {
    return { ok: false, value: {} };
  }
}

function strMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, val] of Object.entries(v as Dict)) if (typeof val === 'string') out[k] = val;
  }
  return out;
}

/** Lowest version satisfying a composer/npm constraint, or null. */
export function minVersionOf(constraint: string): string | null {
  const alts = constraint
    .replace(/@\w+/g, '')
    .replace(/-dev\b/g, '')
    .split(/\|\|?/)
    .map((a) => a.trim().replace(/,/g, ' ').replace(/\s+/g, ' '))
    .filter(Boolean);
  let best: semver.SemVer | null = null;
  for (const alt of alts) {
    let v: semver.SemVer | null = null;
    try {
      v = semver.validRange(alt) ? semver.minVersion(alt) : null;
    } catch {
      v = null;
    }
    if (v && (!best || semver.lt(v, best))) best = v;
  }
  return best ? best.version : null;
}

function lockVersion(lock: Dict, name: string): string | null {
  const pkgs = lock.packages;
  if (!Array.isArray(pkgs)) return null;
  for (const p of pkgs) {
    if (p && typeof p === 'object' && (p as Dict).name === name && typeof (p as Dict).version === 'string') {
      const v = semver.valid(semver.coerce((p as Dict).version as string));
      if (v) return v;
    }
  }
  return null;
}

function base(path: string): DetectedApp {
  return {
    path,
    isLaravel: false,
    laravelVersion: null,
    laravelMajor: null,
    laravelConstraint: null,
    phpConstraint: null,
    frontendStack: 'blade',
    tailwindVersion: null,
    livewireVersion: null,
    testFramework: 'none',
    usesVite: false,
    supported: false,
  };
}

const FRONTEND_PKGS = ['vue', 'react', 'svelte', 'alpinejs', 'tailwindcss', '@tailwindcss/vite', '@tailwindcss/postcss'];

export function detectApp(input: DetectInput): DetectedApp {
  const app = base(input.path);
  const composer = parseObj(input.composerJson);
  const lock = parseObj(input.composerLock);
  const pkg = parseObj(input.packageJson);
  if (input.composerJson === undefined || !composer.ok) {
    app.unsupportedReason = composer.ok ? 'Not a Laravel app' : 'composer.json is not valid JSON';
    return app;
  }
  if (!lock.ok) {
    // lock is optional: fall back to constraints
    lock.value = {};
  }
  if (!pkg.ok) pkg.value = {};

  const require = strMap(composer.value.require);
  const requireDev = strMap(composer.value['require-dev']);
  const allComposer = { ...requireDev, ...require };
  app.phpConstraint = require.php ?? null;

  const constraint = require['laravel/framework'] ?? null;
  app.laravelConstraint = constraint;
  if (!constraint) {
    app.unsupportedReason = 'Not a Laravel app';
    return app;
  }
  app.isLaravel = true;

  const npmDeps = { ...strMap(pkg.value.devDependencies), ...strMap(pkg.value.dependencies) };

  // tooling
  app.usesVite = 'vite' in npmDeps || 'laravel-vite-plugin' in npmDeps;
  const tw = npmDeps.tailwindcss ?? npmDeps['@tailwindcss/vite'] ?? npmDeps['@tailwindcss/postcss'];
  if (tw) {
    const min = minVersionOf(tw);
    app.tailwindVersion = min;
    if (!min && /^[\^~>=\s]*4/.test(tw)) app.tailwindVersion = '4.0.0';
  }
  const pestOrUnit: TestFramework = 'pestphp/pest' in allComposer ? 'pest' : 'phpunit/phpunit' in allComposer ? 'phpunit' : 'none';
  app.testFramework = pestOrUnit;

  // livewire
  if ('livewire/livewire' in allComposer) {
    app.livewireVersion = lockVersion(lock.value, 'livewire/livewire') ?? minVersionOf(allComposer['livewire/livewire']!);
  }

  // frontend stack: inertia (needs both composer + npm signals) wins over livewire when both exist
  let stack: FrontendStack;
  if ('inertiajs/inertia-laravel' in allComposer && '@inertiajs/vue3' in npmDeps) stack = 'inertia_vue';
  else if ('inertiajs/inertia-laravel' in allComposer && '@inertiajs/react' in npmDeps) stack = 'inertia_react';
  else if ('livewire/livewire' in allComposer) stack = 'livewire';
  else if (!app.usesVite && !FRONTEND_PKGS.some((k) => k in npmDeps) && !Object.keys(npmDeps).some((k) => k.startsWith('@inertiajs/'))) stack = 'api_only';
  else stack = 'blade';
  app.frontendStack = stack;

  // laravel version
  const exact = lockVersion(lock.value, 'laravel/framework');
  const version = exact ?? minVersionOf(constraint);
  if (!version) {
    app.unsupportedReason = 'Could not determine Laravel version';
    return app;
  }
  app.laravelVersion = version;
  app.laravelMajor = semver.major(version);
  const major = app.laravelMajor;
  if (major >= 10 && major <= 13) app.supported = true;
  else if (major > 13) app.unsupportedReason = 'Laravel major not supported yet';
  else if (major >= 8) app.unsupportedReason = 'planned for v1';
  else app.unsupportedReason = 'planned for v2';
  return app;
}
