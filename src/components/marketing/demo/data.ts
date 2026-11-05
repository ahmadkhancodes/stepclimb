import { eolStatus } from "@/lib/engine/detect/eol";

/** Fixed "today" for every sample on the page, so the day counts never drift. */
export const SAMPLE_TODAY = new Date("2026-11-05T00:00:00Z");

export type TaskState = "done" | "must" | "review";

export interface SampleTask {
  n: string;
  title: string;
  files: string;
  state: TaskState;
}

export const sampleTasks: SampleTask[] = [
  { n: "01", title: "Raise the PHP minimum to 8.3", files: "composer.json", state: "done" },
  { n: "02", title: "Rewrite laravel/framework constraint to ^13.0", files: "composer.json · composer.lock", state: "done" },
  { n: "03", title: "Three way diff against the tagged skeleton", files: "bootstrap/app.php · config/queue.php", state: "must" },
  { n: "04", title: "Bump first party packages", files: "sanctum · tinker · pint", state: "done" },
  { n: "05", title: "Repair pass, rule composer.platform", files: "separate commit, 1 of 3 loops used", state: "review" },
];

export type RunStatus = "verified" | "unverified" | "failed" | "none";

export interface HangarRow {
  repo: string;
  stack: string;
  /** Laravel major and the full version string. */
  major: number;
  version: string;
  tests: number;
  status: RunStatus;
  run?: string;
  action: string;
}

export const hangarRows: HangarRow[] = [
  { repo: "northgate/billing-portal", stack: "Livewire · Pest", major: 11, version: "11.45", tests: 214, status: "verified", run: "#4821", action: "Open PR · $9.99" },
  { repo: "harborline/dispatch-api", stack: "API only · PHPUnit", major: 10, version: "10.48", tests: 388, status: "none", action: "Plan 3 hop chain" },
  { repo: "pinecrest/clinic-booking", stack: "Inertia React · Pest", major: 12, version: "12.8", tests: 127, status: "verified", run: "#4807", action: "Open PR · $9.99" },
  { repo: "lumen-works/storefront", stack: "Blade · no tests", major: 11, version: "11.31", tests: 0, status: "unverified", run: "#4793", action: "Re run" },
  { repo: "quarry-co/crm", stack: "Inertia Vue · Pest", major: 13, version: "13.2", tests: 291, status: "verified", run: "#4776", action: "Weekly deps on" },
  { repo: "tidewater/field-ops", stack: "Livewire · PHPUnit", major: 12, version: "12.15", tests: 76, status: "failed", run: "#4812", action: "View 2 squawks" },
];

export const LATEST_MAJOR = 13;
export const majorsBehind = (major: number) => Math.max(0, LATEST_MAJOR - major);

export const sampleEol = (major: number) => eolStatus(major, SAMPLE_TODAY);

/** "238 d ago", "1 y ago", "111 d left". */
export function eolLabel(major: number): { text: string; tone: "ended" | "soon" | "ok" } {
  const s = sampleEol(major);
  if (s.state === "unknown" || s.days === null) return { text: "in support", tone: "ok" };
  if (s.days < 0) {
    const d = Math.abs(s.days);
    return { text: d >= 365 ? `ended ${Math.floor(d / 365)} y ago` : `ended ${d} d ago`, tone: "ended" };
  }
  return { text: `${s.days} d left`, tone: s.days <= 180 ? "soon" : "ok" };
}
