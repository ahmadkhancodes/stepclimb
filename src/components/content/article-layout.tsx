import type { ReactNode } from "react";
import { Container } from "@/components/ui/layout";

export interface TocItem { id: string; label: string }

/** Two column article body: content on the left, sticky "On this page" on large screens. */
export function ArticleLayout({ toc, children }: { toc: TocItem[]; children: ReactNode }) {
  return (
    <Container className="py-12 md:py-20">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
        <nav aria-label="On this page" className="lg:order-2 lg:col-span-3">
          <div className="flex flex-col gap-2 lg:sticky lg:top-24">
            <p className="caption-3 text-text-muted">On this page</p>
            <ul className="flex flex-col">
              {toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="body-6 flex min-h-11 items-center text-text-subtle hover:text-text focus-visible:focus-ring">{t.label}</a>
                </li>
              ))}
            </ul>
          </div>
        </nav>
        <article className="flex min-w-0 flex-col gap-12 lg:order-1 lg:col-span-9">{children}</article>
      </div>
    </Container>
  );
}
