import { Stamp } from "@/components/marketing/demo/stamp";
import { DateChip } from "@/components/marketing/demo/eol-chip";
import { RunwayBar } from "@/components/marketing/demo/runway-bar";
import type { ScanReport } from "@/lib/github/scan";
import { eolText, formatDate, TEST_LABEL } from "@/lib/github/hangar";
import type { EffortBand } from "@/lib/engine/types";

const EFFORT_TEXT: Record<EffortBand, string> = {
  S: "Small: at most one hop and your tests can verify it.",
  M: "Medium: two hops, or one hop without a test suite.",
  L: "Large: a three hop chain, delivered as three PRs.",
  XL: "Extra large: more than three hops, or not supported yet.",
};

export function EffortBadge({ band }: { band: EffortBand }) {
  return <span aria-label={`Effort ${band}`} className="mono-data heading-5 inline-flex size-10 items-center justify-center border-2 border-text">{band}</span>;
}

/** Free scan report (brief item 4): versions behind, EOL date, applicable recipes, effort band, risk flags, EOL calendar. */
export function InspectionReport({ report }: { report: ScanReport }) {
  return (
    <div className="flex flex-col gap-6" data-testid="inspection-report">
      <p className="caption-5 text-text-subtle">Branch <span className="mono-data">{report.branch}</span> · scanned {report.scannedAt.slice(0, 10)} · latest Laravel major {report.latestMajor}</p>
      {report.apps.length === 0 ? (
        <section className="rounded-lg border border-border bg-surface-raised p-6">
          <h2 className="title-2 text-text">No Laravel app found</h2>
          <p className="body-6 mt-2 text-text-subtle">No composer.json with laravel/framework was found in this repository, so there is nothing to upgrade.</p>
        </section>
      ) : null}
      {report.apps.map((a) => {
        const eol = eolText(a.eol);
        return (
          <section key={a.path || "root"} aria-label={`App ${a.path || "root"}`} className="flex flex-col gap-4 border border-border bg-surface p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="title-2 text-text">{a.path ? a.path : "Root app"}</h2>
                <p className="mono-data body-6 text-text-subtle">Laravel {a.app.laravelVersion ?? "unknown"} · PHP {a.app.phpConstraint ?? "unspecified"} · {TEST_LABEL[a.app.testFramework]}</p>
              </div>
              <div className="flex items-center gap-3"><span className="caption-3 uppercase tracking-wider text-text-subtle">Effort</span><EffortBadge band={a.effort} /></div>
            </div>
            <p className="body-6 text-text-subtle">{EFFORT_TEXT[a.effort]}</p>
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="caption-3 uppercase tracking-wider text-text-subtle">Versions behind</dt>
                <dd className="mt-1 flex items-center gap-2"><RunwayBar behind={a.behind} /><span className="body-6">{a.behind === 0 ? "Current" : `${a.behind} ${a.behind === 1 ? "major" : "majors"}`}</span></dd>
              </div>
              <div>
                <dt className="caption-3 uppercase tracking-wider text-text-subtle">Security support</dt>
                <dd className="mt-1 flex items-center gap-2"><DateChip tone={eol.tone}>{eol.text}</DateChip><span className="body-6 text-text-subtle">{a.eol.securityEnd ? formatDate(a.eol.securityEnd) : "date not published"}</span></dd>
              </div>
              <div>
                <dt className="caption-3 uppercase tracking-wider text-text-subtle">Frontend</dt>
                <dd className="body-6 mt-1">{a.app.frontendStack.replace("_", " ")}{a.app.tailwindVersion ? ` · Tailwind ${a.app.tailwindVersion}` : ""}{a.app.livewireVersion ? ` · Livewire ${a.app.livewireVersion}` : ""}</dd>
              </div>
            </dl>
            {a.hops.length ? (
              <div>
                <h3 className="title-3 text-text">Applicable recipes</h3>
                <ol className="mt-2 flex flex-col gap-3">
                  {a.hops.map((h) => (
                    <li key={h.from} className="border border-border bg-surface-raised p-4">
                      <p className="title-4 text-text">Laravel {h.from} to {h.to}</p>
                      {h.missing ? <p className="body-6 mt-1 text-text-subtle">No recipe for this hop yet.</p> : (
                        <ul className="mt-2 flex flex-col gap-1">
                          {h.recipes.map((r) => (
                            <li key={r.key} className="body-6 flex flex-wrap items-center gap-2">
                              <span className="mono-data caption-5 text-text-subtle">{r.engine}</span>
                              <span>{r.title}</span>
                              {r.unverified ? <Stamp tone="unverified">Needs review</Stamp> : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {a.riskFlags.length ? (
              <div>
                <h3 className="title-3 text-text">Risk flags</h3>
                <ul className="body-6 mt-2 list-disc pl-5 text-text-subtle">{a.riskFlags.map((f) => <li key={f}>{f}</li>)}</ul>
              </div>
            ) : null}
          </section>
        );
      })}
      <section aria-labelledby="eol-h" className="border border-border bg-surface p-6">
        <h2 id="eol-h" className="title-2 text-text">EOL calendar</h2>
        <p className="body-6 mt-1 text-text-subtle">End of security fixes. Dates are reviewed by hand; a blank means the date is not published yet.</p>
        <table className="mt-4 w-full border-collapse">
          <thead><tr><th scope="col" className="caption-3 border-b border-border py-2 text-left uppercase tracking-wider text-text-subtle">Release</th><th scope="col" className="caption-3 border-b border-border py-2 text-left uppercase tracking-wider text-text-subtle">Security fixes end</th><th scope="col" className="caption-3 border-b border-border py-2 text-left uppercase tracking-wider text-text-subtle">Status</th></tr></thead>
          <tbody>
            {report.calendar.map((c) => {
              const e = eolText(c);
              return (
                <tr key={c.label}>
                  <th scope="row" className="body-4 h-10 border-b border-border text-left font-normal">{c.label}</th>
                  <td className="mono-data body-6 border-b border-border">{c.securityEnd ? formatDate(c.securityEnd) : "not published"}</td>
                  <td className="border-b border-border"><DateChip tone={e.tone}>{e.text}</DateChip></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
