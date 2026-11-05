import type { Db } from "@/lib/db";
import type { EffortBand } from "@/lib/engine/types";
import { latestScan, type AppReport } from "./scan";
import type { InstallationDoc, RepoDoc } from "./sync";

export interface HangarRow {
  key: string;
  repoId: string;
  repo: string;
  path: string;
  scanId: string | null;
  /** scanned: Laravel app found; not_laravel: scanned, nothing to upgrade; unscanned */
  kind: "laravel" | "not_laravel" | "unscanned";
  stack: string;
  version: string | null;
  major: number | null;
  behind: number;
  eol: AppReport["eol"] | null;
  tests: "pest" | "phpunit" | "none" | null;
  effort: EffortBand | null;
  supported: boolean;
  /** M3 adds runs; until then every airframe is "No run". */
  lastRun: null;
}

export interface Hangar {
  installations: (InstallationDoc & { id: string })[];
  rows: HangarRow[];
  repoCount: number;
}

const STACK: Record<string, string> = { blade: "Blade", livewire: "Livewire", inertia_vue: "Inertia Vue", inertia_react: "Inertia React", api_only: "API only" };
export const TEST_LABEL = { pest: "Pest", phpunit: "PHPUnit", none: "No tests" } as const;

export async function loadHangar(db: Db, orgId: string): Promise<Hangar> {
  const installations = await db.docs.find<InstallationDoc>("installations", { accountId: orgId });
  const repos = await db.docs.find<RepoDoc>("repos", { accountId: orgId }, { sort: { field: "fullName", dir: 1 } });
  const rows: HangarRow[] = [];
  for (const r of repos) {
    const scan = await latestScan(db, r.id);
    const base = { repoId: r.id, repo: r.fullName, scanId: scan?.id ?? null, lastRun: null };
    if (!scan) {
      rows.push({ ...base, key: r.id, path: "", kind: "unscanned", stack: "", version: null, major: null, behind: 0, eol: null, tests: null, effort: null, supported: false });
      continue;
    }
    if (!scan.report.apps.length) {
      rows.push({ ...base, key: r.id, path: "", kind: "not_laravel", stack: "", version: null, major: null, behind: 0, eol: null, tests: null, effort: null, supported: false });
      continue;
    }
    for (const a of scan.report.apps) {
      rows.push({
        ...base, key: `${r.id}:${a.path}`, path: a.path, kind: "laravel",
        stack: STACK[a.app.frontendStack] ?? "", version: a.app.laravelVersion, major: a.app.laravelMajor, behind: a.behind,
        eol: a.eol, tests: a.app.testFramework, effort: a.effort, supported: a.app.supported,
      });
    }
  }
  return { installations, rows, repoCount: repos.length };
}

export interface Bulletin { tone: "soon" | "ended"; major: number; securityEnd: string; days: number; affected: number }

/** Service bulletin: the nearest support end inside 12 months, else the most recent ended major still in the fleet. */
export function serviceBulletin(rows: HangarRow[]): Bulletin | null {
  const laravel = rows.filter((r): r is HangarRow & { major: number; eol: NonNullable<HangarRow["eol"]> } => r.kind === "laravel" && r.major !== null && r.eol !== null && r.eol.securityEnd !== null && r.eol.days !== null);
  const soon = laravel.filter((r) => r.eol.state === "supported" && r.eol.days! <= 365).sort((a, b) => a.eol.days! - b.eol.days!)[0];
  if (soon) {
    return { tone: "soon", major: soon.major, securityEnd: soon.eol.securityEnd!, days: soon.eol.days!, affected: laravel.filter((r) => r.major === soon.major).length };
  }
  const ended = laravel.filter((r) => r.eol.state === "ended").sort((a, b) => b.major - a.major)[0];
  if (!ended) return null;
  return { tone: "ended", major: ended.major, securityEnd: ended.eol.securityEnd!, days: ended.eol.days!, affected: laravel.filter((r) => r.eol.state === "ended").length };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

/** "ended 238 d ago", "ended 1 y ago", "111 d left" */
export function eolText(eol: { state: string; days: number | null }): { text: string; tone: "ended" | "soon" | "ok" } {
  if (eol.state === "unknown" || eol.days === null) return { text: "in support", tone: "ok" };
  if (eol.days < 0) {
    const d = Math.abs(eol.days);
    return { text: d >= 365 ? `ended ${Math.floor(d / 365)} y ago` : `ended ${d} d ago`, tone: "ended" };
  }
  return { text: `${eol.days} d left`, tone: eol.days <= 180 ? "soon" : "ok" };
}
