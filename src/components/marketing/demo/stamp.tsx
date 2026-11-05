import { Check, X } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/components/ui/cn";

type StampTone = "ok" | "unverified" | "failed" | "idle";

const tones: Record<StampTone, string> = {
  ok: "text-success",
  unverified: "bg-amber text-black",
  failed: "text-danger",
  idle: "text-text-subtle",
};

/** Small status stamp for tables: uppercase, 1px border, 2px radius. Icon plus text plus colour. */
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
 * The Return to Service stamp: double 1.5px border, rotated -2 degrees, condensed caps.
 * `sc-stamp-in` animates it in once (160ms); reduced motion shows it at rest.
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
      style={{ transform: "rotate(-2deg)" }}
      className={cn(
        "inline-block rounded-sm border-[1.5px] px-3 py-2 text-center outline outline-[1.5px] -outline-offset-[5px]",
        verified ? "border-success text-success outline-success" : "border-black bg-amber text-black outline-black",
        animate && "sc-stamp-in",
        className,
      )}
    >
      <span className="heading-6 block uppercase leading-5 tracking-wider">{verified ? "Return to service" : "Unverified"}</span>
      <span className="mono-data caption-4 mt-1 block uppercase">{verified ? `Verified · ${tests} tests passed` : "No tests found"}</span>
      <span className="mono-data caption-4 block uppercase">Run {run} · {date}</span>
    </div>
  );
}
