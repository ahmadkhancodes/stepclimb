import { minVersionOf } from "@/lib/engine/recipes";
import type { VerifyResult } from "@/lib/engine/repair";
import type { VirtualFs } from "@/lib/engine/vfs";

/**
 * A small stand in for `composer update` used by the fake runner (tests and fixture e2e). It knows the minimum
 * package versions each Laravel major needs and prints failures in Composer's solver format, so the repair rules
 * are exercised the way real output would exercise them. It is NOT a measure of real world pass rate (see PROGRESS.md).
 */
const MIN: Record<number, Record<string, string>> = {
  11: { "laravel/sanctum": "4.0.0", "laravel/cashier": "15.0.0", "nunomaduro/collision": "8.1.0", "inertiajs/inertia-laravel": "1.0.0", "livewire/livewire": "3.4.0", "laravel/passport": "12.0.0", "laravel/telescope": "5.0.0", "laravel/horizon": "5.24.0", "laravel/scout": "10.0.0", "laravel/socialite": "5.0.0", "laravel/jetstream": "5.0.0", "laravel/breeze": "2.0.0", "laravel/pint": "1.13.0", "laravel/tinker": "2.9.0", "laravel/sail": "1.26.0", "spatie/laravel-permission": "6.0.0", "larastan/larastan": "3.0.0", "laravel/fortify": "1.20.0" },
  12: { "phpunit/phpunit": "11.0.0", "pestphp/pest": "3.0.0", "pestphp/pest-plugin-laravel": "3.0.0" },
  13: { "phpunit/phpunit": "12.0.0", "pestphp/pest": "4.0.0", "pestphp/pest-plugin-laravel": "4.0.0" },
};
const MIN_PHP: Record<number, string> = { 11: "8.2.0", 12: "8.2.0", 13: "8.3.0" };
const REMOVED: Record<number, string[]> = { 11: ["spatie/once"] };

export function targetMajorOf(fs: VirtualFs): number | null {
  try {
    const j = JSON.parse(fs.read("composer.json") ?? "{}") as { require?: Record<string, string> };
    const v = minVersionOf(j.require?.["laravel/framework"] ?? "");
    return v ? v.major : null;
  } catch { return null; }
}

export function simulatedComposer(fs: VirtualFs): VerifyResult {
  const raw = fs.read("composer.json");
  let j: { require?: Record<string, string>; "require-dev"?: Record<string, string> };
  try { j = JSON.parse(raw ?? ""); } catch { return { passed: false, stage: "composer", output: "composer.json is not valid JSON" }; }
  const target = targetMajorOf(fs);
  if (target === null) return { passed: false, stage: "composer", output: "Root composer.json requires laravel/framework, which could not be read" };
  const deps = { ...(j["require-dev"] ?? {}), ...(j.require ?? {}) };
  const problems: string[] = [];
  const php = minVersionOf(deps.php ?? "");
  const need = MIN_PHP[target];
  if (php && need && php.compare(need) < 0) problems.push(`- laravel/framework v${target}.0.0 requires php ^${need.replace(/\.0$/, "")} -> your php version (${php.version}) does not satisfy that requirement.`);
  for (let m = 11; m <= target; m++) {
    for (const [pkg, min] of Object.entries(MIN[m] ?? {})) {
      const c = deps[pkg];
      const v = c ? minVersionOf(c) : null;
      if (c && v && v.compare(min) < 0) problems.push(`- Root composer.json requires ${pkg} ${c} -> satisfiable by ${pkg}[v${v.version}] but these were not loaded, likely because it conflicts with another require.`);
    }
    for (const pkg of REMOVED[m] ?? []) if (deps[pkg]) problems.push(`- Root composer.json requires ${pkg} ${deps[pkg]} -> Cannot redeclare once() (conflicts with the framework helper).`);
  }
  if (problems.length === 0) return { passed: true, stage: "composer", output: `Updating dependencies\nGenerating autoload files\nlaravel/framework upgraded to ${target}.x` };
  return { passed: false, stage: "composer", output: `Your requirements could not be resolved to an installable set of packages.\n\n  Problem ${1}\n    ${problems.join("\n    ")}` };
}

export function simulatedVerify(stage: VerifyResult["stage"], fs: VirtualFs): VerifyResult {
  if (stage === "composer") return simulatedComposer(fs);
  return { passed: true, stage, output: `${stage} ok (simulated)` };
}
