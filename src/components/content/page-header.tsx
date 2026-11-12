import type { ReactNode } from "react";
import Link from "next/link";
import { Container } from "@/components/ui/layout";

export interface Crumb { label: string; href?: string }

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="caption-2 text-text-muted">
      <ol className="flex flex-wrap items-center gap-x-2">
        {items.map((c, i) => (
          <li key={c.label} className="flex items-center gap-2">
            {c.href ? <Link href={c.href} className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-text focus-visible:focus-ring">{c.label}</Link> : <span aria-current="page">{c.label}</span>}
            {i < items.length - 1 ? <span aria-hidden>/</span> : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Page header for content pages: breadcrumb, then a ruled two column head (title left, lede and actions right). */
export function PageHeader({
  crumbs, title, lede, meta, actions,
}: { crumbs?: Crumb[]; title: ReactNode; lede?: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="bg-surface">
      <Container className="pb-4 pt-6 md:pb-6 md:pt-8">
        {crumbs ? <Breadcrumbs items={crumbs} /> : null}
        <div className="rule-double mt-4 grid gap-6 pt-8 lg:grid-cols-12 lg:gap-12">
          <h1 className="heading-3 md:heading-1 text-text lg:col-span-7">{title}</h1>
          <div className="flex flex-col items-start gap-4 lg:col-span-5 lg:pt-2">
            {lede ? <p className="body-3 text-text-subtle">{lede}</p> : null}
            {meta ? <p className="mono-data caption-4 text-text-muted">{meta}</p> : null}
            {actions ? <div className="flex flex-wrap items-center gap-4">{actions}</div> : null}
          </div>
        </div>
      </Container>
    </header>
  );
}
