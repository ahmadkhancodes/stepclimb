import { ArrowRight, Warning } from "@phosphor-icons/react/dist/ssr";
import { Stamp } from "./stamp";
import { RunwayBar } from "./runway-bar";
import { EolChip } from "./eol-chip";
import { hangarRows, majorsBehind, eolLabel, sampleEol, type HangarRow, type RunStatus } from "./data";

const statusStamp = (s: RunStatus) => {
  switch (s) {
    case "verified": return <Stamp tone="ok">Verified</Stamp>;
    case "unverified": return <Stamp tone="unverified">Unverified</Stamp>;
    case "failed": return <Stamp tone="failed">Failed</Stamp>;
    default: return <Stamp tone="idle">No run</Stamp>;
  }
};

const behindText = (n: number) => (n === 0 ? "current" : `${n} ${n === 1 ? "major" : "majors"} behind`);

const th = "caption-3 whitespace-nowrap border-b border-border bg-surface px-3 py-2 text-left uppercase tracking-wider text-text-subtle";
const td = "h-10 whitespace-nowrap border-b border-border px-3 group-last:border-b-0";

function Row({ r }: { r: HangarRow }) {
  return (
    <tr className="group transition-colors duration-300 ease-out-kit hover:bg-action-soft">
      <td className={td}>
        <span className="body-4 block text-text">{r.repo}</span>
        <span className="caption-5 block text-text-subtle">{r.stack}</span>
      </td>
      <td className={`${td} mono-data body-6`}>{r.version}</td>
      <td className={td}><RunwayBar behind={majorsBehind(r.major)} /></td>
      <td className={td}><EolChip major={r.major} /></td>
      <td className={`${td} mono-data body-6 ${r.tests === 0 ? "text-text-subtle" : ""}`}>{r.tests}</td>
      <td className={td}>
        <span className="inline-flex items-center gap-2">{statusStamp(r.status)}{r.run ? <span className="mono-data body-6 text-text-subtle">{r.run}</span> : null}</span>
      </td>
      <td className={`${td} text-right`}>
        <span className="button-sm inline-flex items-center gap-1 text-action">{r.action}<ArrowRight size={16} weight="regular" aria-hidden /></span>
      </td>
    </tr>
  );
}

/** Dense fleet table at md and up, stacked list below. Example data, fixed today. */
export function HangarBoard() {
  const left = hangarRows.filter((r) => r.major === 12).length;
  const e12 = sampleEol(12).days;
  const stats = [
    { k: "Airframes", v: String(hangarRows.length), s: "" },
    { k: "Past support", v: String(hangarRows.filter((r) => sampleEol(r.major).state === "ended").length), s: "on 10.x or 11.x" },
    { k: "Verified this month", v: "3", s: "of 5 runs" },
    { k: "Open squawks", v: "7", s: "2 must fix" },
  ];
  return (
    <figure aria-label="Example hangar board" className="relative border border-border bg-surface shadow-[0_1px_0_rgba(20,25,28,0.06),0_8px_24px_-12px_rgba(20,25,28,0.18)] dark:shadow-none">
      <span className="stamp-text absolute -top-3 left-6 bg-surface-inverse px-2 text-text-inverse">Example, fictional agency</span>
      <div className="flex items-center justify-between gap-4 border-b border-border bg-surface-raised px-4 py-3">
        <p className="body-4 text-text">Kestrel Digital <span className="body-6 text-text-subtle">· Agency plan</span></p>
        <span className="button-sm inline-flex min-h-8 items-center rounded-md bg-action px-3 text-action-text" aria-hidden="true">New work order</span>
      </div>
      <div role="note" className="body-6 m-4 flex items-start gap-3 rounded-md border border-amber bg-warning-surface p-3 text-text">
        <Warning size={16} weight="regular" aria-hidden className="mt-0.5 shrink-0" />
        <p><b className="font-bold">Service bulletin.</b> Laravel 12 security support ends 24 Feb 2027, in {e12} days. {left} airframes in this hangar are affected.</p>
      </div>
      <dl className="mx-4 grid grid-cols-2 border border-border bg-surface-raised md:grid-cols-4">
        {stats.map((s, i) => (
          <div key={s.k} className={`px-4 py-3 ${i % 2 === 1 ? "border-l border-border" : ""} ${i > 1 ? "border-t border-border md:border-t-0" : ""} ${i > 0 ? "md:border-l" : ""}`}>
            <dt className="caption-3 uppercase tracking-wider text-text-subtle">{s.k}</dt>
            <dd className="mono-data heading-4 mt-1">{s.v}{s.s ? <small className="caption-5 ml-1 font-sans text-text-subtle">{s.s}</small> : null}</dd>
          </div>
        ))}
      </dl>
      <div role="region" aria-label="Example Hangar table" tabIndex={0} className="m-4 hidden overflow-x-auto border border-border bg-surface-raised focus-visible:focus-ring md:block">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {["Airframe", "Laravel", "Behind", "Support", "Tests", "Last work order"].map((h) => <th key={h} scope="col" className={th}>{h}</th>)}
              <th scope="col" className={th}><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>{hangarRows.map((r) => <Row key={r.repo} r={r} />)}</tbody>
        </table>
      </div>
      <ul aria-label="Airframes" className="m-4 border border-border bg-surface-raised md:hidden">
        {hangarRows.slice(0, 4).map((r) => (
          <li key={r.repo} className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-1 border-b border-border p-3 last:border-b-0">
            <span className="body-4 text-text">{r.repo}</span>
            {statusStamp(r.status)}
            <span className="mono-data caption-5 col-span-2 text-text-subtle">
              Laravel {r.version} · {behindText(majorsBehind(r.major))} · {eolLabel(r.major).text}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
