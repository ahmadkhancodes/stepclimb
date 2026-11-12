import type { ReactNode } from "react";
import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/components/ui/cn";

/** Section of an article: anchored h2 plus a flow of blocks. */
export function ArticleSection({ id, title, children, className }: { id: string; title: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className={cn("flex scroll-mt-24 flex-col gap-4", className)}>
      <h2 id={`${id}-h`} className="heading-5 text-text">{title}</h2>
      {children}
    </section>
  );
}

export function P({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("body-3 max-w-2xl text-text-subtle", className)}>{children}</p>;
}

export function UL({ items, className }: { items: ReactNode[]; className?: string }) {
  return (
    <ul className={cn("body-3 flex max-w-2xl list-disc flex-col gap-2 pl-6 text-text-subtle", className)}>
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  );
}

export function OL({ items, className }: { items: ReactNode[]; className?: string }) {
  return (
    <ol className={cn("body-3 flex max-w-2xl list-decimal flex-col gap-2 pl-6 text-text-subtle", className)}>
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ol>
  );
}

const linkCls = "text-link underline underline-offset-4 hover:text-link-hover focus-visible:focus-ring";

/** Internal link in running text. */
export function A({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} className={linkCls}>{children}</a>;
}

/** External source link: opens in a new tab, named in the text. */
export function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={cn(linkCls, "inline-flex items-center gap-1")}>
      {children}<ArrowUpRight size={14} aria-hidden /><span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** Service bulletin: a dated, boxed statement. Border all around, flat fill. */
export function Bulletin({ label = "Service bulletin", tone = "info", children }: { label?: string; tone?: "info" | "warning"; children: ReactNode }) {
  return (
    <aside className={cn("flex max-w-2xl flex-col gap-2 rounded-none border p-4", tone === "warning" ? "border-warning bg-warning-surface" : "border-border bg-surface-raised")}>
      <p className="stamp-text text-text-muted">{label}</p>
      <div className="body-6 text-text">{children}</div>
    </aside>
  );
}

/** Sources list with the date they were checked. */
export function Sources({ checked, items }: { checked: string; items: { label: string; href: string }[] }) {
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <p className="body-6 text-text-subtle">Sources, checked {checked}.</p>
      <ul className="flex flex-col gap-1">
        {items.map((s) => (
          <li key={s.href} className="body-6"><Ext href={s.href}>{s.label}</Ext></li>
        ))}
      </ul>
    </div>
  );
}

/** Inline code and version text in the mono face. */
export function Mono({ children }: { children: ReactNode }) {
  return <code className="mono-data rounded-sm bg-surface-sunken px-1 text-text">{children}</code>;
}
