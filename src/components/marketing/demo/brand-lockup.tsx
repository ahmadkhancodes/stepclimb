import { cn } from "@/components/ui/cn";

/** Teal stair mark with the amber torque stripe. Colour comes from `currentColor` plus the amber token. */
export function BrandMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={cn("shrink-0 text-action", className)}>
      <path d="M3 21h4v-4h4v-4h4V9h4V5h2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
      <path d="M3 5l4 4M3 9l2 2" className="stroke-amber" strokeWidth="2" strokeLinecap="square" fill="none" />
    </svg>
  );
}

/** Stepclimb with "by BufferSol" beneath, plus the mark. */
export function BrandLockup({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <BrandMark />
      <span className="flex flex-col">
        <span className="heading-6 leading-5 text-text">Stepclimb</span>
        <span className="caption-4 mt-0.5 leading-3 text-text-subtle">by BufferSol</span>
      </span>
    </span>
  );
}
