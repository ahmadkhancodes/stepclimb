import { RunwayBar } from "./runway-bar";
import { EolChip } from "./eol-chip";
import { securityEnd } from "@/lib/engine/detect/eol";
import { majorsBehind } from "./data";

const fmt = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "Current release";

/** Laravel 10 to 13, security end dates from the in house calendar. Laravel 13 has no published date yet, so none is shown. */
export function SupportRunway() {
  return (
    <figure aria-label="Laravel security support dates" className="border border-border bg-surface-raised">
      <table className="w-full border-collapse">
        <caption className="sr-only">Security fix end dates for Laravel 10 to 13, checked 3 Nov 2026</caption>
        <thead>
          <tr>
            {["Release", "Behind 13", "Security fixes", "Status"].map((h, i) => (
              <th key={h} scope="col" className={`label-log border-b border-border px-3 py-2 text-left text-text-subtle ${i === 1 ? "hidden sm:table-cell" : ""}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[10, 11, 12, 13].map((m) => (
            <tr key={m} className="border-b border-border last:border-b-0">
              <th scope="row" className="mono-data body-5 h-10 px-3 text-left text-text">Laravel {m}</th>
              <td className="hidden px-3 sm:table-cell"><RunwayBar behind={majorsBehind(m)} /></td>
              <td className="mono-data body-6 px-3 text-text-subtle">{fmt(securityEnd(m))}</td>
              <td className="px-3"><EolChip major={m} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption className="caption-5 border-t border-border px-3 py-2 text-text-subtle">
        Dates from the Laravel release notes, checked 3 Nov 2026. Day counts as of 5 Nov 2026.
      </figcaption>
    </figure>
  );
}
