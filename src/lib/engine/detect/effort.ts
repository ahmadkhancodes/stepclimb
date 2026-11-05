import type { DetectedApp, EffortBand } from '../types';

/** Latest Laravel major Stepclimb knows about. */
export const LATEST_LARAVEL_MAJOR = 13;

export function majorsBehind(major: number, latestMajor: number): number {
  return Math.max(0, latestMajor - major);
}

/**
 * Effort band rule (a "hop" is one major version upgrade):
 *  - XL: app not supported (non Laravel, old majors, unknown version) or more than 3 hops
 *  - L : 3 hops
 *  - M : 2 hops, or 1 hop without a test suite
 *  - S : 0 or 1 hop with tests (pest or phpunit)
 */
export function effortBand(app: DetectedApp, majors: number): EffortBand {
  if (!app.supported || !app.isLaravel) return 'XL';
  if (majors > 3) return 'XL';
  if (majors === 3) return 'L';
  if (majors === 2) return 'M';
  return app.testFramework === 'none' && majors === 1 ? 'M' : 'S';
}
