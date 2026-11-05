import { Check } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/components/ui/cn";
import { Stamp } from "./stamp";

/** The weekly grouped dependency PR: one PR that refreshes, not a pile. */
export function AutopilotPr({ className }: { className?: string }) {
  return (
    <figure aria-label="Sample weekly dependency pull request" className={cn("border border-border bg-surface-raised", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
        <p className="body-5 text-text">Weekly dependencies</p>
        <Stamp tone="ok">Verified</Stamp>
      </div>
      <ul className="px-4 py-2">
        {["livewire/livewire 3.6.1 → 3.6.4", "pestphp/pest 3.8.0 → 3.8.2", "vite 6.2.0 → 6.2.3"].map((d) => (
          <li key={d} className="mono-data caption-5 flex items-center gap-2 py-0.5 text-text-subtle"><Check size={12} weight="regular" aria-hidden className="text-success" />{d}</li>
        ))}
      </ul>
      <p className="caption-5 border-t border-border px-4 py-2 text-text-subtle">Monday 06:00, repo timezone. Updated in place.</p>
    </figure>
  );
}
