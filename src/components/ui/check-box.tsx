import { cn } from "./cn";

/**
 * Checklist box: the work order motif (docs/design-brief.md section 4). A square box, ticked or open.
 * Decorative: the text next to it carries the meaning. `animate` ticks it once (160ms, reduced motion: at rest).
 */
export function CheckBox({ checked = true, tone = "ink", animate = false, className }: { checked?: boolean; tone?: "ink" | "success" | "danger"; animate?: boolean; className?: string }) {
  const c = { ink: "text-text", success: "text-success", danger: "text-danger" }[tone];
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" className={cn("shrink-0", c, animate && "sc-tick-in", className)}>
      <rect x="0.75" y="0.75" width="14.5" height="14.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {checked ? <path d="M4 8.5l2.75 2.75L12.5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" /> : null}
    </svg>
  );
}
