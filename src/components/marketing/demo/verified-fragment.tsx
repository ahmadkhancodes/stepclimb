import { Check } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/components/ui/cn";
import { ReturnStamp } from "./stamp";

/** The sign off strip on its own: three checks and the stamp, at rest. */
export function VerifiedFragment({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-start justify-between gap-4 border border-border bg-surface-raised p-4 sm:flex-row sm:items-center", className)}>
      <ul className="grid gap-1">
        <li className="body-6 flex items-center gap-2"><Check size={16} weight="regular" aria-hidden className="text-success" />composer install</li>
        <li className="body-6 flex items-center gap-2"><Check size={16} weight="regular" aria-hidden className="text-success" />npm run build</li>
        <li className="body-6 flex items-center gap-2"><Check size={16} weight="regular" aria-hidden className="text-success" /><span className="mono-data">214 tests passed</span></li>
      </ul>
      <ReturnStamp animate={false} className="self-center" />
    </div>
  );
}
