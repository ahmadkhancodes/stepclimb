import semver from "semver";

/** The runner image carries one PHP (8.3): Laravel 10 to 12 all run on it. A repo that excludes it is refused up front, not failed halfway. */
export const RUNNER_PHP = "8.3.36";

/** Composer `require.php` constraint -> does the runner's PHP satisfy it? Unknown syntax counts as satisfied (composer decides). */
export function runnerPhpSatisfies(constraint: string | undefined | null, php = RUNNER_PHP): boolean {
  if (!constraint) return true;
  const range = constraint.trim().replace(/\|\|?/g, " || ").replace(/\s*,\s*/g, " ").replace(/\.\*/g, ".x").replace(/@\w+/g, "");
  const valid = semver.validRange(range);
  return valid ? semver.satisfies(php, valid) : true;
}
