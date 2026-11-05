import { RunwayBar } from "./runway-bar";
import { EolChip } from "./eol-chip";
import { cn } from "@/components/ui/cn";

const rows: [string, string][] = [
  ["Laravel", "11.45"],
  ["PHP constraint", "^8.2"],
  ["Stack", "Livewire 3, Vite, Pest"],
  ["Recipes that apply", "9 of 9 for 11 to 13"],
];

/** A free inspection report: versions behind, support end, recipes that apply, effort band. */
export function InspectionReport({ className }: { className?: string }) {
  return (
    <figure aria-label="Sample inspection report" className={cn("border border-border bg-surface-raised", className)}>
      <dl>
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 border-b border-border px-4 py-2">
            <dt className="body-6 text-text-subtle">{k}</dt>
            <dd className="mono-data body-6 text-text">{v}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-2">
          <dt className="body-6 text-text-subtle">Behind</dt>
          <dd className="flex items-center gap-2"><RunwayBar behind={2} /><span className="mono-data body-6">2 majors</span></dd>
        </div>
        <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-2">
          <dt className="body-6 text-text-subtle">Security fixes</dt>
          <dd><EolChip major={11} /></dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-2">
          <dt className="body-6 text-text-subtle">Effort band</dt>
          <dd className="flex items-center gap-1" aria-label="Effort band M of S, M, L, XL">
            {["S", "M", "L", "XL"].map((b) => (
              <span key={b} className={cn("mono-data caption-3 inline-flex min-w-6 justify-center rounded-sm border px-1", b === "M" ? "border-action bg-action text-action-text" : "border-border text-text-subtle")}>{b}</span>
            ))}
          </dd>
        </div>
      </dl>
    </figure>
  );
}
