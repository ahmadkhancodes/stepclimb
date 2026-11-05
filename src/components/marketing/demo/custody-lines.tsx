import { cn } from "@/components/ui/cn";

const lines: [string, string][] = [
  ["Sandbox", "destroyed after the run"],
  ["Network", "registries and GitHub only"],
  ["Code kept", "none"],
  ["AI services", "none"],
];

/** Data custody as a ruled key and value list. */
export function CustodyLines({ className }: { className?: string }) {
  return (
    <dl aria-label="Data custody" className={cn("border border-border bg-surface-raised", className)}>
      {lines.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-4 border-b border-border px-4 py-2 last:border-b-0">
          <dt className="body-6 text-text-subtle">{k}</dt>
          <dd className="mono-data body-6 text-right text-text">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
