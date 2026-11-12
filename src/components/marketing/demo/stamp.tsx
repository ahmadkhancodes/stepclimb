import { Check, X } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/components/ui/cn";
import { CheckBox } from "@/components/ui/check-box";

type StampTone = "ok" | "unverified" | "failed" | "idle";

const tones: Record<StampTone, string> = {
  ok: "text-success",
  unverified: "bg-amber text-text",
  failed: "text-danger",
  idle: "text-text-subtle",
};

/** Small state tag for tables: uppercase, 1px border, 2px radius. Icon plus text plus colour. */
export function Stamp({ tone, children }: { tone: StampTone; children: string }) {
  return (
    <span className={cn("stamp-text inline-flex items-center gap-1 rounded-sm border border-current px-2 leading-5", tones[tone])}>
      {tone === "ok" ? <Check size={12} weight="regular" aria-hidden /> : null}
      {tone === "failed" ? <X size={12} weight="regular" aria-hidden /> : null}
      {children}
    </span>
  );
}

/**
 * The Return to Service tag: a hangar serviceability tag with an eyelet, a ticked box and the sign-off line.
 * Square and upright (no rotation, no ink stamp). `animate` ticks the box once (160ms); reduced motion shows it ticked.
 */
export function ReturnStamp({
  verified = true,
  tests = 214,
  run = "4821",
  date = "05 Nov 2026",
  animate = true,
  className,
}: {
  verified?: boolean;
  tests?: number;
  run?: string;
  date?: string;
  animate?: boolean;
  className?: string;
}) {
  const label = verified ? `Return to service. Verified, ${tests} tests passed.` : "Unverified. This repo has no tests.";
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "relative inline-grid grid-cols-[auto_1fr] items-start gap-x-3 rounded-md border-2 py-2 pl-6 pr-3 text-left",
        verified ? "border-success bg-success-surface text-success" : "border-text bg-amber text-text",
        className,
      )}
    >
      <span aria-hidden className="absolute left-2 top-1/2 size-2 -translate-y-1/2 rounded-full border-2 border-current bg-surface-raised" />
      <CheckBox checked={verified} tone={verified ? "success" : "ink"} animate={animate} className="mt-0.5" />
      <span>
        <span className="label-log block">{verified ? "Return to service" : "Unverified"}</span>
        <span className="mono-data caption-4 mt-1 block uppercase">{verified ? `Verified · ${tests} tests passed` : "No tests found"}</span>
        <span className="mono-data caption-4 block uppercase">Run {run} · {date}</span>
      </span>
    </div>
  );
}
