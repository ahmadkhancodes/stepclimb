import { join } from "node:path";
import type { Db } from "@/lib/db";
import { detectApp, effortBand, EOL_CALENDAR, eolStatus, findAppPaths, LATEST_LARAVEL_MAJOR, majorsBehind, securityEnd } from "@/lib/engine/detect";
import { loadRecipes, planHops, type Recipe } from "@/lib/engine/recipes";
import type { DetectedApp, EffortBand } from "@/lib/engine/types";
import type { GithubApi } from "./api";
import { repoDocId, type RepoDoc } from "./sync";

export const READS_NOTE = "Reads composer.json, composer.lock and package.json only. No code is cloned.";
const MAX_APPS = 10;

export interface ReportRecipe { key: string; title: string; engine: string; unverified: boolean }
export interface ReportHop { from: number; to: number; recipes: ReportRecipe[]; missing: boolean }
export interface AppReport {
  path: string;
  app: DetectedApp;
  behind: number;
  effort: EffortBand;
  eol: { state: "ended" | "supported" | "unknown"; days: number | null; securityEnd: string | null };
  hops: ReportHop[];
  riskFlags: string[];
}
export interface ScanReport {
  repo: string;
  branch: string;
  scannedAt: string;
  reads: string;
  latestMajor: number;
  apps: AppReport[];
  effort: EffortBand | null;
  calendar: { product: string; label: string; securityEnd: string | null; state: "ended" | "supported" | "unknown"; days: number | null }[];
}

let catalog: Recipe[] | null = null;
export function recipeCatalog(): Recipe[] {
  return (catalog ??= loadRecipes(join(process.cwd(), "recipes")));
}

const ORDER: EffortBand[] = ["S", "M", "L", "XL"];
const worst = (bands: EffortBand[]): EffortBand | null => bands.reduce<EffortBand | null>((a, b) => (a === null || ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a), null);

function hasPrivateRepo(composerJson: string | undefined): boolean {
  try {
    const repos = (JSON.parse(composerJson ?? "{}") as { repositories?: unknown }).repositories;
    const list = Array.isArray(repos) ? repos : repos && typeof repos === "object" ? Object.values(repos) : [];
    return list.some((r) => r && typeof r === "object" && (r as { type?: string }).type === "composer" && !/packagist\.org/.test(String((r as { url?: string }).url ?? "")));
  } catch {
    return false;
  }
}

/** Pure: builds one app's section of the report from already fetched manifests. */
export function buildAppReport(app: DetectedApp, input: { composerJson?: string; composerLock?: string }, today: Date, recipes: Recipe[]): AppReport {
  const major = app.laravelMajor;
  const behind = major === null ? 0 : majorsBehind(major, LATEST_LARAVEL_MAJOR);
  const end = major === null ? null : securityEnd(major);
  const st = major === null ? { state: "unknown" as const, days: null } : eolStatus(major, today);
  const hops: ReportHop[] = [];
  if (app.supported && major !== null) {
    for (let v = major; v < LATEST_LARAVEL_MAJOR; v++) {
      try {
        const [h] = planHops(app, v, v + 1, recipes);
        hops.push({ from: v, to: v + 1, missing: false, recipes: (h?.recipes ?? []).map((r) => ({ key: r.key, title: r.title, engine: r.engine, unverified: r.unverified === true })) });
      } catch {
        hops.push({ from: v, to: v + 1, missing: true, recipes: [] });
      }
    }
  }
  const risk: string[] = [];
  if (!app.isLaravel) risk.push(app.unsupportedReason ?? "Not a Laravel app");
  else if (!app.supported) risk.push(`Not supported yet: ${app.unsupportedReason ?? "unknown reason"}`);
  if (app.isLaravel && app.testFramework === "none") risk.push("No test suite found: a PR would be marked Unverified");
  if (app.isLaravel && st.state === "ended") risk.push("Security support for this Laravel major has ended");
  if (app.isLaravel && input.composerLock === undefined) risk.push("composer.lock missing: version taken from the constraint");
  if (hasPrivateRepo(input.composerJson)) risk.push("Private Composer repository: auth needed (not supported yet)");
  if (hops.some((h) => h.missing)) risk.push("No recipe yet for at least one hop");
  return { path: app.path, app, behind, effort: effortBand(app, behind), eol: { ...st, securityEnd: end }, hops, riskFlags: risk };
}

export function eolCalendar(today: Date): ScanReport["calendar"] {
  const laravel = EOL_CALENDAR.laravel.map((e) => {
    const s = eolStatus(e.major, today);
    return { product: "laravel", label: `Laravel ${e.major}`, securityEnd: e.securityEnd, state: s.state, days: s.days };
  });
  const php = EOL_CALENDAR.php.map((p) => {
    const days = Math.round((Date.parse(`${p.securityEnd}T00:00:00Z`) - Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) / 86_400_000);
    return { product: "php", label: `PHP ${p.version}`, securityEnd: p.securityEnd, state: (days < 0 ? "ended" : "supported") as "ended" | "supported", days };
  });
  return [...laravel, ...php];
}

export function buildReport(repo: string, branch: string, apps: AppReport[], today: Date): ScanReport {
  return { repo, branch, scannedAt: today.toISOString(), reads: READS_NOTE, latestMajor: LATEST_LARAVEL_MAJOR, apps, effort: worst(apps.map((a) => a.effort)), calendar: eolCalendar(today) };
}

export interface ScanDoc {
  repoId: string;
  accountId: string | null;
  effortBand: EffortBand | null;
  eolDate: string | null;
  riskFlags: string[];
  report: ScanReport;
  createdAt: Date;
}

/** Reads manifests through the GitHub contents API, detects each app, stores `apps` and a `scans` document. */
export async function scanRepo(db: Db, api: GithubApi, repo: RepoDoc & { id: string }, opts: { today?: Date; recipes?: Recipe[] } = {}): Promise<ScanDoc & { id: string }> {
  const today = opts.today ?? new Date();
  const recipes = opts.recipes ?? recipeCatalog();
  const { installationId, fullName, defaultBranch } = repo;
  const tree = await api.listTree(installationId, fullName, defaultBranch);
  const paths = findAppPaths(tree).slice(0, MAX_APPS);
  const file = (dir: string, name: string) => api.getFile(installationId, fullName, dir ? `${dir}/${name}` : name, defaultBranch).then((v) => v ?? undefined);
  const apps: AppReport[] = [];
  for (const dir of paths) {
    const [composerJson, composerLock, packageJson] = await Promise.all([file(dir, "composer.json"), file(dir, "composer.lock"), file(dir, "package.json")]);
    const app = detectApp({ path: dir, composerJson, composerLock, packageJson });
    if (!app.isLaravel) continue;
    apps.push(buildAppReport(app, { composerJson, composerLock }, today, recipes));
  }
  await db.docs.remove("apps", { repoId: repo.id });
  for (const a of apps) {
    await db.docs.put("apps", `${repo.id}:${a.path || "."}`, {
      repoId: repo.id, accountId: repo.accountId, path: a.path, laravelVersion: a.app.laravelVersion, laravelMajor: a.app.laravelMajor,
      phpConstraint: a.app.phpConstraint, frontendStack: a.app.frontendStack, tailwindVersion: a.app.tailwindVersion,
      livewireVersion: a.app.livewireVersion, testFramework: a.app.testFramework, supported: a.app.supported, updatedAt: today,
    });
  }
  const report = buildReport(fullName, defaultBranch, apps, today);
  const primary = apps[0];
  const doc: ScanDoc = {
    repoId: repo.id,
    accountId: repo.accountId,
    effortBand: report.effort,
    eolDate: primary?.eol.securityEnd ?? null,
    riskFlags: [...new Set(apps.flatMap((a) => a.riskFlags))],
    report,
    createdAt: today,
  };
  // sortable, collision free id: time then repo
  const id = `${String(today.getTime()).padStart(14, "0")}-${repo.id}`;
  await db.docs.put("scans", id, doc as unknown as Record<string, unknown>);
  return { ...doc, id };
}

export async function latestScan(db: Db, repoId: string): Promise<(ScanDoc & { id: string }) | null> {
  const [s] = await db.docs.find<ScanDoc>("scans", { repoId }, { sort: { field: "createdAt", dir: -1 }, limit: 1 });
  return s ?? null;
}

/** Latest scan of many repos in one query (list screens: no N+1). */
export async function latestScans(db: Db, repoIds: string[]): Promise<Map<string, ScanDoc & { id: string }>> {
  const out = new Map<string, ScanDoc & { id: string }>();
  if (!repoIds.length) return out;
  const all = await db.docs.find<ScanDoc>("scans", {}, { in: { field: "repoId", values: repoIds }, sort: { field: "createdAt", dir: -1 } });
  for (const s of all) if (!out.has(s.repoId)) out.set(s.repoId, s);
  return out;
}

export { repoDocId };
