import type { ReactNode } from "react";
import { cn } from "./cn";

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

/**
 * Marketing section. `tone` steps the surface; `rhythm` varies the vertical padding on purpose
 * (tight ledger 64, base 96, open statement 128 on desktop) so pages do not repeat one cadence.
 */
export function Section({ id, tone = "base", rhythm = "base", className, children, labelledBy }: { id?: string; tone?: "base" | "raised" | "inverse"; rhythm?: "tight" | "base" | "open"; className?: string; children: ReactNode; labelledBy?: string }) {
  const t = { base: "bg-surface", raised: "bg-surface-raised border-y border-border", inverse: "bg-surface-inverse text-text-inverse" }[tone];
  const r = { tight: "py-12 md:py-16", base: "py-12 md:py-24", open: "py-16 md:py-32" }[rhythm];
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn(r, t, className)}>
      <Container>{children}</Container>
    </section>
  );
}
