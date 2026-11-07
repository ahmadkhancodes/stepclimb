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

/** Page header for content pages: breadcrumb, h1, one lede, dated line, actions. Solid ink, flat. */
export function PageHeader({
  crumbs, title, lede, meta, actions,
}: { crumbs?: Crumb[]; title: ReactNode; lede?: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="border-b border-border bg-surface">
      <Container className="py-12 md:py-20">
        <div className="flex max-w-2xl flex-col items-start gap-4">
          {crumbs ? <Breadcrumbs items={crumbs} /> : null}
          <h1 className="heading-3 md:heading-2 text-text">{title}</h1>
          {lede ? <p className="body-3 text-text-subtle md:title-1">{lede}</p> : null}
          {meta ? <p className="mono-data caption-4 text-text-muted">{meta}</p> : null}
          {actions ? <div className="flex flex-wrap items-center gap-4 pt-2">{actions}</div> : null}
        </div>
      </Container>
    </header>
  );
}
