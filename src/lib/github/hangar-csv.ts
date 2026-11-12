import { TEST_LABEL, type HangarRow } from "./hangar";

const HEADER = ["repository", "app_path", "status", "laravel_version", "majors_behind", "security_support_ends", "security_support_state", "tests", "frontend_stack", "effort"] as const;

/** One CSV cell. Quotes when needed, and defuses spreadsheet formulas (=, +, -, @, tab, CR) so an export can never run code in Excel. */
export function csvCell(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The fleet as CSV for the agency account manager: one row per airframe, UTF-8, CRLF. */
export function hangarCsv(rows: HangarRow[]): string {
  const lines = [HEADER.join(",")];
  for (const r of rows) {
    lines.push([
      r.repo, r.path, r.kind === "laravel" ? "laravel" : r.kind === "unscanned" ? "not_scanned" : "not_laravel",
      r.version, r.kind === "laravel" ? r.behind : "", r.eol?.securityEnd ?? "", r.eol?.state ?? "",
      r.tests ? TEST_LABEL[r.tests] : "", r.stack, r.effort ?? "",
    ].map((c) => csvCell(c as string | number | null)).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
