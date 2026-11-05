import { describe, expect, it } from 'vitest';
import { detectApp, eolStatus, securityEnd, effortBand, majorsBehind, LATEST_LARAVEL_MAJOR, findAppPaths, EOL_CALENDAR } from './index';

const composer = (require: Record<string, string>, dev: Record<string, string> = {}) =>
  JSON.stringify({ name: 'acme/app', require: { php: '^8.2', ...require }, 'require-dev': dev });
const lock = (pkgs: Record<string, string>) =>
  JSON.stringify({ packages: Object.entries(pkgs).map(([name, version]) => ({ name, version })) });
const pkg = (deps: Record<string, string>) => JSON.stringify({ devDependencies: deps });

describe('detectApp', () => {
  it('Laravel 10 from constraint', () => {
    const a = detectApp({ path: '', composerJson: composer({ 'laravel/framework': '^10.10' }, { 'phpunit/phpunit': '^10' }) });
    expect(a).toMatchObject({ isLaravel: true, laravelVersion: '10.10.0', laravelMajor: 10, supported: true, testFramework: 'phpunit', phpConstraint: '^8.2' });
  });
  it('Laravel 11 exact from lock', () => {
    const a = detectApp({ path: '', composerJson: composer({ 'laravel/framework': '^11.0' }), composerLock: lock({ 'laravel/framework': 'v11.31.0' }) });
    expect(a.laravelVersion).toBe('11.31.0');
    expect(a.laravelMajor).toBe(11);
  });
  it('Laravel 12 with wildcard and alternatives', () => {
    expect(detectApp({ path: '', composerJson: composer({ 'laravel/framework': '12.*' }) }).laravelVersion).toBe('12.0.0');
    expect(detectApp({ path: '', composerJson: composer({ 'laravel/framework': '^11.0|^12.0' }) }).laravelMajor).toBe(11);
    expect(detectApp({ path: '', composerJson: composer({ 'laravel/framework': '^12.0 || ^11.0' }) }).laravelMajor).toBe(11);
    expect(detectApp({ path: '', composerJson: composer({ 'laravel/framework': '>=11.0 <13' }) }).laravelMajor).toBe(11);
    expect(detectApp({ path: '', composerJson: composer({ 'laravel/framework': '~12.1' }) }).laravelVersion).toBe('12.1.0');
  });
  it('Laravel 13 supported', () => {
    const a = detectApp({ path: '', composerJson: composer({ 'laravel/framework': '^13.0', 'pestphp/pest': '^4' }) });
    expect(a.supported).toBe(true);
    expect(a.testFramework).toBe('pest');
  });
  it('Laravel 9 and 8 planned for v1, 7 and 6 for v2, 14 unsupported', () => {
    expect(detectApp({ path: '', composerJson: composer({ 'laravel/framework': '^9.0' }) })).toMatchObject({ supported: false, unsupportedReason: 'planned for v1' });
    expect(detectApp({ path: '', composerJson: composer({ 'laravel/framework': '^8.75' }) }).unsupportedReason).toBe('planned for v1');
    expect(detectApp({ path: '', composerJson: composer({ 'laravel/framework': '^7.0' }) }).unsupportedReason).toBe('planned for v2');
    expect(detectApp({ path: '', composerJson: composer({ 'laravel/framework': '5.8.*' }) }).unsupportedReason).toBe('planned for v2');
    expect(detectApp({ path: '', composerJson: composer({ 'laravel/framework': '^14.0' }) }).supported).toBe(false);
  });
  it('Livewire app', () => {
    const a = detectApp({
      path: '',
      composerJson: composer({ 'laravel/framework': '^11.0', 'livewire/livewire': '^3.4' }),
      composerLock: lock({ 'laravel/framework': 'v11.9.0', 'livewire/livewire': 'v3.5.2' }),
      packageJson: pkg({ vite: '^5', 'laravel-vite-plugin': '^1', tailwindcss: '^3.4.0' }),
    });
    expect(a).toMatchObject({ frontendStack: 'livewire', livewireVersion: '3.5.2', usesVite: true });
  });
  it('Livewire version from constraint without lock', () => {
    expect(detectApp({ path: '', composerJson: composer({ 'laravel/framework': '^11.0', 'livewire/livewire': '^3.0' }) }).livewireVersion).toBe('3.0.0');
  });
  it('Inertia Vue and React', () => {
    const c = composer({ 'laravel/framework': '^12.0', 'inertiajs/inertia-laravel': '^2.0' });
    expect(detectApp({ path: '', composerJson: c, packageJson: pkg({ '@inertiajs/vue3': '^2', vite: '^6' }) }).frontendStack).toBe('inertia_vue');
    expect(detectApp({ path: '', composerJson: c, packageJson: pkg({ '@inertiajs/react': '^2', vite: '^6' }) }).frontendStack).toBe('inertia_react');
  });
  it('API only without vite or frontend packages', () => {
    expect(detectApp({ path: '', composerJson: composer({ 'laravel/framework': '^11.0' }) }).frontendStack).toBe('api_only');
    expect(detectApp({ path: '', composerJson: composer({ 'laravel/framework': '^11.0' }), packageJson: JSON.stringify({ name: 'x' }) }).frontendStack).toBe('api_only');
  });
  it('Blade when vite present but no livewire/inertia', () => {
    expect(detectApp({ path: '', composerJson: composer({ 'laravel/framework': '^11.0' }), packageJson: pkg({ vite: '^5', 'laravel-vite-plugin': '^1' }) }).frontendStack).toBe('blade');
  });
  it('Pest beats phpunit, none otherwise', () => {
    expect(detectApp({ path: '', composerJson: composer({ 'laravel/framework': '^11.0' }, { 'pestphp/pest': '^3', 'phpunit/phpunit': '^11' }) }).testFramework).toBe('pest');
    expect(detectApp({ path: '', composerJson: composer({ 'laravel/framework': '^11.0' }) }).testFramework).toBe('none');
  });
  it('Tailwind 3 vs 4', () => {
    const c = composer({ 'laravel/framework': '^11.0' });
    const t3 = detectApp({ path: '', composerJson: c, packageJson: pkg({ tailwindcss: '^3.4.1' }) });
    const t4 = detectApp({ path: '', composerJson: c, packageJson: pkg({ tailwindcss: '^4.0.0', '@tailwindcss/vite': '^4.0.0' }) });
    const t4b = detectApp({ path: '', composerJson: c, packageJson: pkg({ '@tailwindcss/postcss': '^4.1.0' }) });
    expect(t3.tailwindVersion?.startsWith('3.')).toBe(true);
    expect(t4.tailwindVersion?.startsWith('4.')).toBe(true);
    expect(t4b.tailwindVersion?.startsWith('4.')).toBe(true);
    expect(detectApp({ path: '', composerJson: c }).tailwindVersion).toBeNull();
  });
  it('Symfony app is not Laravel', () => {
    const a = detectApp({ path: '', composerJson: composer({ 'symfony/framework-bundle': '^7.0' }) });
    expect(a).toMatchObject({ isLaravel: false, supported: false, unsupportedReason: 'Not a Laravel app', laravelVersion: null });
  });
  it('malformed JSON', () => {
    const a = detectApp({ path: 'apps/api', composerJson: '{ "require": ' });
    expect(a).toMatchObject({ path: 'apps/api', isLaravel: false, supported: false });
    expect(a.unsupportedReason).toContain('not valid JSON');
    const b = detectApp({ path: '', composerJson: composer({ 'laravel/framework': '^11.0' }), composerLock: '{oops', packageJson: '[1' });
    expect(b.laravelMajor).toBe(11);
    expect(detectApp({ path: '', composerJson: '[]' }).isLaravel).toBe(false);
  });
  it('monorepo apps detected independently', () => {
    const api = detectApp({ path: 'apps/api', composerJson: composer({ 'laravel/framework': '^12.0' }) });
    const web = detectApp({ path: 'apps/web', composerJson: composer({ 'laravel/framework': '^10.0', 'livewire/livewire': '^3' }) });
    expect(api.path).toBe('apps/api');
    expect(web.frontendStack).toBe('livewire');
  });
});

describe('findAppPaths', () => {
  it('monorepo, ignoring vendor, node_modules, tests', () => {
    const tree = [
      'composer.json', 'apps/web/composer.json', 'apps/api/composer.json', 'apps/api/vendor/x/composer.json',
      'node_modules/y/composer.json', 'tests/fixtures/app/composer.json', 'apps/web/tests/Fixtures/composer.json',
      'README.md', 'apps/web/composer.lock',
    ];
    expect(findAppPaths(tree)).toEqual(['', 'apps/api', 'apps/web']);
  });
  it('no root composer', () => {
    expect(findAppPaths(['api/composer.json', 'a/composer.json'])).toEqual(['a', 'api']);
    expect(findAppPaths([])).toEqual([]);
  });
});

describe('eol', () => {
  const today = new Date('2026-11-05T12:00:00Z');
  it('calendar data', () => {
    expect(securityEnd(10)).toBe('2025-02-04');
    expect(securityEnd(11)).toBe('2026-03-12');
    expect(securityEnd(12)).toBe('2027-02-24');
    expect(securityEnd(13)).toBeNull();
    expect(securityEnd(9)).toBeNull();
    expect(EOL_CALENDAR.php[0]).toEqual({ version: '8.2', securityEnd: '2026-12-31' });
  });
  it('Laravel 11 ended 238 days ago, 12 has 111 left, 13 unknown', () => {
    expect(eolStatus(11, today)).toEqual({ state: 'ended', days: -238 });
    expect(eolStatus(12, today)).toEqual({ state: 'supported', days: 111 });
    expect(eolStatus(13, today)).toEqual({ state: 'unknown', days: null });
    expect(eolStatus(10, today).state).toBe('ended');
  });
  it('last day is still supported with 0 days', () => {
    expect(eolStatus(12, new Date('2027-02-24T00:00:00Z'))).toEqual({ state: 'supported', days: 0 });
  });
});

describe('effort', () => {
  const mk = (c: string, dev: Record<string, string> = {}) => detectApp({ path: '', composerJson: composer({ 'laravel/framework': c }, dev) });
  it('majorsBehind', () => {
    expect(LATEST_LARAVEL_MAJOR).toBe(13);
    expect(majorsBehind(11, 13)).toBe(2);
    expect(majorsBehind(13, 13)).toBe(0);
    expect(majorsBehind(14, 13)).toBe(0);
  });
  it('bands', () => {
    const tested = mk('^12.0', { 'phpunit/phpunit': '^11' });
    const untested = mk('^12.0');
    expect(effortBand(tested, 1)).toBe('S');
    expect(effortBand(untested, 1)).toBe('M');
    expect(effortBand(tested, 2)).toBe('M');
    expect(effortBand(tested, 3)).toBe('L');
    expect(effortBand(tested, 4)).toBe('XL');
    expect(effortBand(mk('^9.0'), 1)).toBe('XL');
    expect(effortBand(detectApp({ path: '', composerJson: composer({}) }), 1)).toBe('XL');
  });
});
