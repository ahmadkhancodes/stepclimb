import type { GithubApi, GithubRepoInfo } from "./api";

// Fixture GitHub: used by unit tests and by e2e (GITHUB_FIXTURES=1). No network, ever.
export const FIXTURE_INSTALLATION_ID = "9001";
export const FIXTURE_LOGIN = "kestrel-digital";

const j = (o: unknown) => JSON.stringify(o);
const lock = (version: string, extra: { name: string; version: string }[] = []) =>
  j({ packages: [{ name: "laravel/framework", version: `v${version}` }, ...extra] });

interface FixtureRepo extends GithubRepoInfo { files: Record<string, string> }

const repo = (id: number, fullName: string, files: Record<string, string>, over: Partial<GithubRepoInfo> = {}): FixtureRepo => ({
  id, fullName, defaultBranch: "main", private: true, archived: false, pushedAt: "2026-10-28T09:00:00Z", files, ...over,
});

export const FIXTURE_REPOS: FixtureRepo[] = [
  repo(1, `${FIXTURE_LOGIN}/billing-portal`, {
    "composer.json": j({ require: { php: "^8.2", "laravel/framework": "^11.0", "livewire/livewire": "^3.5" }, "require-dev": { "pestphp/pest": "^3.0" } }),
    "composer.lock": lock("11.45.0", [{ name: "livewire/livewire", version: "v3.5.12" }]),
    "package.json": j({ devDependencies: { vite: "^5.0", "laravel-vite-plugin": "^1.0", tailwindcss: "^3.4.0" } }),
  }),
  repo(2, `${FIXTURE_LOGIN}/dispatch-api`, {
    "composer.json": j({ require: { php: "^8.1", "laravel/framework": "^10.0" }, "require-dev": { "phpunit/phpunit": "^10.1" } }),
    "composer.lock": lock("10.48.0"),
  }),
  repo(3, `${FIXTURE_LOGIN}/clinic-booking`, {
    "composer.json": j({ require: { php: "^8.2", "laravel/framework": "^12.0", "inertiajs/inertia-laravel": "^2.0" }, "require-dev": { "pestphp/pest": "^3.0" } }),
    "composer.lock": lock("12.8.0"),
    "package.json": j({ dependencies: { "@inertiajs/react": "^2.0", react: "^19.0" }, devDependencies: { vite: "^6.0" } }),
  }),
  repo(4, `${FIXTURE_LOGIN}/storefront`, {
    "composer.json": j({ require: { php: "^8.2", "laravel/framework": "^11.0" }, repositories: [{ type: "composer", url: "https://packages.example.com" }] }),
    "package.json": j({ devDependencies: { vite: "^5.0" } }),
  }),
  repo(5, `${FIXTURE_LOGIN}/marketing-site`, { "package.json": j({ dependencies: { next: "16.0.0" } }), "README.md": "# not php" }),
  repo(6, `${FIXTURE_LOGIN}/monorepo`, {
    "apps/web/composer.json": j({ require: { php: "^8.3", "laravel/framework": "^12.0" }, "require-dev": { "phpunit/phpunit": "^11.0" } }),
    "apps/web/composer.lock": lock("12.1.0"),
    "apps/admin/composer.json": j({ require: { php: "^8.2", "laravel/framework": "^11.0" } }),
    "apps/admin/composer.lock": lock("11.2.0"),
  }),
];

export const fixtureInstallationPayload = (action = "created") => ({
  action,
  installation: { id: Number(FIXTURE_INSTALLATION_ID), account: { login: FIXTURE_LOGIN, type: "Organization" }, repository_selection: "selected" },
});

export function createFixtureApi(repos: FixtureRepo[] = FIXTURE_REPOS): GithubApi {
  const find = (full: string) => repos.find((r) => r.fullName === full);
  return {
    async listInstallationRepos() {
      return repos.map(({ files: _f, ...r }) => r);
    },
    async listTree(_i, fullName) {
      return Object.keys(find(fullName)?.files ?? {});
    },
    async getFile(_i, fullName, path) {
      return find(fullName)?.files[path] ?? null;
    },
  };
}
