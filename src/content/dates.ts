/** Dates stated on content pages. One place so a refresh is a one line change. */
export const COMPARED = { iso: "2026-11-03", label: "3 Nov 2026" } as const;
export const CHECKED = { iso: "2026-11-05", label: "5 Nov 2026" } as const;

/** "2026-03-12" to "12 Mar 2026", always in UTC so server and client agree. */
export const formatIso = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
