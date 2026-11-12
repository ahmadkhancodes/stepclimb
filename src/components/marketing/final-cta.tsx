import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/layout";

/** Closing sign off: a double rule, a large display line and one action. No dark slab. */
export function FinalCta({ title, body, cta, note }: { title: ReactNode; body?: ReactNode; cta: { href: string; label: string }; note?: ReactNode }) {
  return (
    <Section labelledBy="final-cta-title" rhythm="open">
      <div className="rule-double grid gap-8 pt-10 lg:grid-cols-12 lg:items-end lg:gap-12">
        <div className="lg:col-span-7">
          <p className="label-log text-text-subtle">Sign off</p>
          <h2 id="final-cta-title" className="heading-3 md:heading-1 mt-6 text-text">{title}</h2>
          {body ? <p className="body-3 mt-6 max-w-2xl text-text-subtle">{body}</p> : null}
        </div>
        <div className="flex flex-col items-start gap-4 lg:col-span-5">
          <ButtonLink href={cta.href} size="lg">{cta.label}</ButtonLink>
          {note ? <p className="caption-2 max-w-sm text-text-muted">{note}</p> : null}
        </div>
      </div>
    </Section>
  );
}
