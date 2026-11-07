/** Autopilot schedule: Monday 06:00 in the repo's timezone (default America/New_York), DST aware through Intl. */
export const DEFAULT_TZ = "America/New_York";
export const WINDOW = { weekday: 1, hour: 6 } as const; // Monday, 06:00 to 06:59 local

export interface LocalParts { year: number; month: number; day: number; weekday: number; hour: number; minute: number }

export const validTimezone = (tz: string | null | undefined): string => {
  if (!tz) return DEFAULT_TZ;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return DEFAULT_TZ; }
};

const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function localParts(now: Date, tz: string): LocalParts {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: validTimezone(tz), hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", weekday: "short", hour: "numeric", minute: "numeric" });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), weekday: WD[p.weekday!] ?? 0, hour: Number(p.hour) % 24, minute: Number(p.minute) };
}

/** True during the hour Monday 06:00 local. The cron runs hourly, `weekKey` makes the run once a week. */
export function isAutopilotWindow(now: Date, tz: string): boolean {
  const l = localParts(now, tz);
  return l.weekday === WINDOW.weekday && l.hour === WINDOW.hour;
}

/** ISO week of the local date, e.g. `2026-W46`. */
export function weekKey(now: Date, tz: string): string {
  const l = localParts(now, tz);
  const d = new Date(Date.UTC(l.year, l.month - 1, l.day));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // the Thursday of this ISO week
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
