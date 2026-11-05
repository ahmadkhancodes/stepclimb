import { cn } from "@/components/ui/cn";
import { eolLabel } from "./data";

const tones = {
  ended: "bg-danger-surface text-danger",
  soon: "bg-warning-surface text-text",
  ok: "bg-success-surface text-success",
} as const;

/** Support countdown in days, from the in house EOL calendar and a fixed sample "today". */
export function EolChip({ major }: { major: number }) {
  const { text, tone } = eolLabel(major);
  return (
    <span className={cn("mono-data caption-3 inline-flex items-center whitespace-nowrap rounded-sm px-2 leading-5", tones[tone])}>
      {text}
    </span>
  );
}

/** A chip with a fixed label, for dated facts such as "ended 12 Mar 2026". */
export function DateChip({ tone, children }: { tone: keyof typeof tones; children: string }) {
  return (
    <span className={cn("mono-data caption-3 inline-flex items-center whitespace-nowrap rounded-sm px-2 leading-5", tones[tone])}>
      {children}
    </span>
  );
}
