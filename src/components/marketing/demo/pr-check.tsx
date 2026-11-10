import { Check } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/components/ui/cn";
import { Stamp } from "./stamp";
import { SeverityShape } from "./squawk-drawer";

/** The pull request as you receive it: work order body, squawk index, the Verified check. Merging stays with you. */
export function PrCheck({ className }: { className?: string }) {
  return (
    <figure aria-label="Example pull request" className={cn("border border-border bg-surface-raised", className)}>
      <div className="border-b border-border px-4 py-3">
        <p className="caption-4 text-text-subtle">northgate/billing-portal · pull request</p>
        <p className="body-4 mt-0.5 text-text">Work order No. 4821: Upgrade to Laravel 13</p>
      </div>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
        <p className="mono-data caption-4 flex items-center gap-2 text-text"><Check size={16} weight="regular" aria-hidden className="text-success" />Stepclimb by BufferSol · Verified</p>
        <Stamp tone="ok">214 passed</Stamp>
      </div>
      <ul className="px-4 py-2">
        <li className="body-6 flex items-center gap-2 py-1"><SeverityShape severity="must" /><span className="mono-data caption-5 text-text-subtle">config/queue.php:38</span><span className="text-text">Must fix</span></li>
        <li className="body-6 flex items-center gap-2 py-1"><SeverityShape severity="review" /><span className="mono-data caption-5 text-text-subtle">bootstrap/app.php:14</span><span className="text-text">Review</span></li>
        <li className="body-6 flex items-center gap-2 py-1"><SeverityShape severity="note" /><span className="mono-data caption-5 text-text-subtle">composer.json:9</span><span className="text-text">Note</span></li>
      </ul>
      <p className="caption-5 border-t border-border px-4 py-2 text-text-subtle">Merging stays with you. We never auto merge.</p>
    </figure>
  );
}
