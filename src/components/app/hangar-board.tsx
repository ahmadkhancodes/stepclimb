import { ArrowRight, Warning } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { DateChip } from "@/components/marketing/demo/eol-chip";
import { RunwayBar } from "@/components/marketing/demo/runway-bar";
import { Stamp } from "@/components/marketing/demo/stamp";
import { eolText, formatDate, serviceBulletin, TEST_LABEL, type Hangar, type HangarRow } from "@/lib/github/hangar";
import { ScanButton } from "./scan-button";

const th = "caption-3 whitespace-nowrap border-b border-border bg-surface px-3 py-2 text-left uppercase tracking-wider text-text-subtle";
const td = "h-10 whitespace-nowrap border-b border-border px-3 group-last:border-b-0";
const behindText = (n: number) => (n === 0 ? "current" : `${n} ${n === 1 ? "major" : "majors"} behind`);

function Support({ r }: { r: HangarRow }) {
  if (!r.eol) return <span className="body-6 text-text-subtle">n/a</span>;
  const { text, tone } = eolText(r.eol);
  return <DateChip tone={tone}>{text}</DateChip>;
}

function Action({ r }: { r: HangarRow }) {
  if (r.kind === "unscanned") return <ScanButton repoId={r.repoId} />;
  if (r.kind === "not_laravel") return <ScanButton repoId={r.repoId} label="Rescan" variant="tertiary" />;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-4">
      <Link href={`/app/inspections/${encodeURIComponent(r.scanId!)}`} className="button-sm inline-flex min-h-11 items-center gap-1 text-action focus-visible:focus-ring">
        Open inspection<ArrowRight size={16} weight="regular" aria-hidden />
      </Link>
      <Link href={`/app/repos/${encodeURIComponent(r.repoId)}`} className="button-sm inline-flex min-h-11 items-center text-text-subtle hover:text-text focus-visible:focus-ring">Autopilot</Link>
    </span>
  );
}

function Name({ r }: { r: HangarRow }) {
  const sub = r.kind === "laravel" ? [r.path ? r.path : null, r.stack, r.tests ? TEST_LABEL[r.tests] : null].filter(Boolean).join(" · ") : r.kind === "unscanned" ? "Not scanned yet" : "Not a Laravel app";
  return (
    <>
      <span className="body-4 block text-text">{r.repo}</span>
      <span className="caption-5 block text-text-subtle">{sub}</span>
    </>
  );
}

export function ServiceBulletin({ rows }: { rows: HangarRow[] }) {
  const b = serviceBulletin(rows);
  if (!b) return null;
  const when = b.tone === "soon" ? `ends ${formatDate(b.securityEnd)}, in ${b.days} days` : `ended ${formatDate(b.securityEnd)}`;
  return (
    <div role="note" aria-label="Service bulletin" className="body-6 flex items-start gap-3 rounded-md border border-amber bg-warning-surface p-3 text-text">
      <Warning size={16} weight="regular" aria-hidden className="mt-0.5 shrink-0" />
      <p><b className="font-bold">Service bulletin.</b> Laravel {b.major} security support {when}. {b.affected} {b.affected === 1 ? "airframe" : "airframes"} in this hangar {b.affected === 1 ? "is" : "are"} affected.</p>
    </div>
  );
}

export function HangarStats({ rows, repoCount }: { rows: HangarRow[]; repoCount: number }) {
  const laravel = rows.filter((r) => r.kind === "laravel");
  const stats = [
    { k: "Airframes", v: String(laravel.length), s: `in ${repoCount} ${repoCount === 1 ? "repo" : "repos"}` },
    { k: "Past support", v: String(laravel.filter((r) => r.eol?.state === "ended").length), s: "security fixes ended" },
    { k: "Behind latest", v: String(laravel.filter((r) => r.behind > 0).length), s: "at least one major" },
    { k: "Not scanned", v: String(rows.filter((r) => r.kind === "unscanned").length), s: "" },
  ];
  return (
    <dl className="grid grid-cols-2 border border-border bg-surface-raised md:grid-cols-4">
      {stats.map((s, i) => (
        <div key={s.k} className={`px-4 py-3 ${i % 2 === 1 ? "border-l border-border" : ""} ${i > 1 ? "border-t border-border md:border-t-0" : ""} ${i > 0 ? "md:border-l" : ""}`}>
          <dt className="caption-3 uppercase tracking-wider text-text-subtle">{s.k}</dt>
          <dd className="mono-data heading-4 mt-1">{s.v}{s.s ? <small className="caption-5 ml-1 font-sans text-text-subtle">{s.s}</small> : null}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The Hangar board: dense table at md and up, stacked list below. Real data from the last scan of each repo. */
export function HangarBoard({ hangar }: { hangar: Hangar }) {
  const { rows } = hangar;
  return (
    <div className="flex flex-col gap-4" data-testid="hangar-board">
      <ServiceBulletin rows={rows} />
      <HangarStats rows={rows} repoCount={hangar.repoCount} />
      <div className="hidden overflow-x-auto border border-border bg-surface-raised md:block">
        <table className="w-full border-collapse">
          <caption className="sr-only">Airframes</caption>
          <thead>
            <tr>
              {["Airframe", "Laravel", "Behind", "Support", "Tests", "Last work order"].map((h) => <th key={h} scope="col" className={th}>{h}</th>)}
              <th scope="col" className={th}><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="group transition-colors duration-300 ease-out-kit hover:bg-action-soft">
                <td className={td}><Name r={r} /></td>
                <td className={`${td} mono-data body-6`}>{r.version ?? "n/a"}</td>
                <td className={td}>{r.kind === "laravel" ? <span className="inline-flex items-center gap-2"><RunwayBar behind={r.behind} /><span className="caption-5 text-text-subtle">{behindText(r.behind)}</span></span> : null}</td>
                <td className={td}><Support r={r} /></td>
                <td className={`${td} mono-data body-6 ${r.tests === "none" ? "text-text-subtle" : ""}`}>{r.tests ? TEST_LABEL[r.tests] : "n/a"}</td>
                <td className={td}>{r.kind === "laravel" ? <Stamp tone="idle">No run</Stamp> : null}</td>
                <td className={`${td} text-right`}><Action r={r} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul aria-label="Airframes" className="border border-border bg-surface-raised md:hidden">
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 border-b border-border p-3 last:border-b-0">
            <span><Name r={r} /></span>
            {r.kind === "laravel" ? <Stamp tone="idle">No run</Stamp> : <span />}
            {r.kind === "laravel" ? (
              <span className="mono-data caption-5 col-span-2 text-text-subtle">Laravel {r.version} · {behindText(r.behind)}{r.eol ? ` · ${eolText(r.eol).text}` : ""}</span>
            ) : null}
            <span className="col-span-2"><Action r={r} /></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
