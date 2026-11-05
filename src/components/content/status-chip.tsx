import { cn } from "@/components/ui/cn";

/** Support status chip: text plus colour, never colour alone. Amber means out of support. */
export function StatusChip({ state, children }: { state: "ended" | "supported" | "unknown"; children: React.ReactNode }) {
  const tone = { ended: "border-warning bg-warning-surface text-text", supported: "border-border bg-surface-raised text-text", unknown: "border-border bg-surface text-text-muted" }[state];
  return <span className={cn("stamp-text inline-flex items-center rounded-sm border px-2 py-0.5", tone)}>{children}</span>;
}
