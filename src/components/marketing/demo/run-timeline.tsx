import { cn } from "@/components/ui/cn";

/** Seconds per stage; the sum is the sample run time, 11 min 42 s. */
const stages = [
  { name: "Clone", s: 21 },
  { name: "Recipes", s: 68 },
  { name: "Composer", s: 160 },
  { name: "Build", s: 115 },
  { name: "Tests", s: 242 },
  { name: "Repair", s: 58 },
  { name: "Verify", s: 38 },
];

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** Run timeline as a Gantt strip. Flat fills, 1px gridlines. */
export function RunTimeline({ className }: { className?: string }) {
  const total = stages.reduce((a, b) => a + b.s, 0);
  return (
    <figure aria-label="Example run timeline" className={cn("border border-border bg-surface-raised p-4", className)}>
      <div className="flex gap-0.5" role="img" aria-label={`Stages: ${stages.map((x) => `${x.name} ${fmt(x.s)}`).join(", ")}`}>
        {stages.map((x, i) => (
          <span key={x.name} className={cn("block h-6 basis-0", i === 5 ? "bg-amber" : "bg-action")} style={{ flexGrow: x.s }} />
        ))}
      </div>
      <ol className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        {stages.map((x) => (
          <li key={x.name} className="flex items-baseline justify-between gap-2 border-t border-border pt-1">
            <span className="caption-4 text-text-subtle">{x.name}</span>
            <span className="mono-data caption-3 text-text">{fmt(x.s)}</span>
          </li>
        ))}
        <li className="col-span-2 flex items-baseline justify-between gap-2 border-t border-border-strong pt-1 sm:col-span-1">
          <span className="caption-3 text-text">Total</span>
          <span className="mono-data caption-3 text-text">{fmt(total)}</span>
        </li>
      </ol>
    </figure>
  );
}
