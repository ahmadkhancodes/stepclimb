// Deterministic fixture corpus: 20 generated Laravel apps per hop (no network). Each varies the PHP constraint, the
// test framework, the frontend and which first party packages still sit on the previous major's constraints.
export interface CorpusApp { name: string; from: number; to: number; files: Record<string, string>; hasTests: boolean }

const OLD: Record<number, [string, string, "require" | "require-dev"][]> = {
  10: [["laravel/sanctum", "^3.3", "require"], ["laravel/cashier", "^14.0", "require"], ["nunomaduro/collision", "^7.0", "require-dev"], ["laravel/telescope", "^4.0", "require"], ["laravel/horizon", "^5.0", "require"], ["laravel/passport", "^11.0", "require"], ["laravel/scout", "^9.0", "require"], ["laravel/socialite", "^5.0", "require"], ["spatie/laravel-permission", "^5.0", "require"], ["livewire/livewire", "^3.0", "require"] ],
  11: [["pestphp/pest-plugin-laravel", "^2.4", "require-dev"], ["laravel/sanctum", "^4.0", "require"], ["laravel/horizon", "^5.24", "require"], ["livewire/livewire", "^3.5", "require"] ],
  12: [["pestphp/pest-plugin-laravel", "^3.0", "require-dev"], ["laravel/sanctum", "^4.0", "require"], ["laravel/horizon", "^5.24", "require"], ["livewire/livewire", "^3.5", "require"]],
};
const TESTS = ["pest", "phpunit", "none"] as const;

export function buildCorpus(perHop = 20): CorpusApp[] {
  const out: CorpusApp[] = [];
  for (const from of [10, 11, 12]) {
    for (let i = 0; i < perHop; i++) {
      const tests = TESTS[i % 3]!;
      const require: Record<string, string> = { php: i % 4 === 0 ? "^8.1" : "^8.2", "laravel/framework": `^${from}.0` };
      const dev: Record<string, string> = {};
      const pool = OLD[from]!;
      // a different subset per app: bit pattern of i+1 over the pool
      pool.forEach(([pkg, con, sec], k) => { if (((i + 1) >> (k % 5)) & 1 && (i + k) % 3 !== 0) (sec === "require" ? require : dev)[pkg] = con; });
      // one app in five uses a package no rule covers yet (laravel/fortify): those are the honest failures
      if (i % 5 === 0 && from === 10) require["laravel/fortify"] = "^1.10";
      if (tests === "pest") { dev["pestphp/pest"] = from >= 12 ? "^3.0" : from === 11 ? "^2.34" : "^2.0"; }
      if (tests === "phpunit") dev["phpunit/phpunit"] = from >= 12 ? "^11.0" : "^10.1";
      const vite = i % 2 === 0;
      const files: Record<string, string> = {
        "composer.json": JSON.stringify({ name: `fixture/app-${from}-${i}`, require, "require-dev": dev }, null, 4) + "\n",
        "composer.lock": JSON.stringify({ packages: [{ name: "laravel/framework", version: `v${from}.${(i * 7) % 40}.0` }] }),
        ...(vite ? { "package.json": JSON.stringify({ devDependencies: { vite: "^5.0", "laravel-vite-plugin": "^1.0" } }) } : {}),
        "app/Http/Kernel.php": "<?php\n",
      };
      out.push({ name: `app-${from}-${i}`, from, to: from + 1, files, hasTests: tests !== "none" });
    }
  }
  return out;
}
