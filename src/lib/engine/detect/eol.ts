/**
 * In-house EOL calendar. Only sourced dates live here; never invent one.
 * Dates are ISO yyyy-mm-dd, interpreted as UTC days.
 */
export interface LaravelEol {
  major: number;
  /** end of security fixes, null = not yet known (fill from laravel.com) */
  securityEnd: string | null;
}
export interface PhpEol {
  version: string;
  securityEnd: string;
}
export interface EolCalendar {
  laravel: LaravelEol[];
  php: PhpEol[];
}

export const EOL_CALENDAR: EolCalendar = {
  laravel: [
    { major: 10, securityEnd: '2025-02-04' },
    { major: 11, securityEnd: '2026-03-12' },
    { major: 12, securityEnd: '2027-02-24' },
    // Unknown: to be filled from laravel.com later.
    { major: 13, securityEnd: null },
  ],
  php: [{ version: '8.2', securityEnd: '2026-12-31' }],
};

export function securityEnd(major: number): string | null {
  return EOL_CALENDAR.laravel.find((e) => e.major === major)?.securityEnd ?? null;
}

export interface EolStatus {
  state: 'ended' | 'supported' | 'unknown';
  /** negative = days since it ended (e.g. -238), positive = days left, null when unknown */
  days: number | null;
}

const DAY_MS = 86_400_000;

export function eolStatus(major: number, today: Date): EolStatus {
  const end = securityEnd(major);
  if (!end) return { state: 'unknown', days: null };
  const endUtc = Date.parse(`${end}T00:00:00Z`);
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const days = Math.round((endUtc - todayUtc) / DAY_MS);
  return { state: days < 0 ? 'ended' : 'supported', days };
}
