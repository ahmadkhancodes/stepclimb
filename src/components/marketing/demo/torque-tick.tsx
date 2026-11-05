import { cn } from "@/components/ui/cn";

/** The torque stripe divider: four short diagonal strokes, drawn as SVG strokes (no gradient). */
export function TorqueTick({ className }: { className?: string }) {
  return (
    <svg width="48" height="8" viewBox="0 0 48 8" aria-hidden="true" className={cn("block text-amber", className)}>
      <path d="M0 8L8 0M12 8L20 0M24 8L32 0M36 8L44 0" stroke="currentColor" strokeWidth="3" fill="none" />
    </svg>
  );
}
