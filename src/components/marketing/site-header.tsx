"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { product } from "@/config/product";
import { buttonClass } from "@/components/ui/button";
import { BrandLockup } from "./demo/brand-lockup";
import { cn } from "@/components/ui/cn";
import { sessionCta } from "./session-labels";
import { useSignedIn } from "./use-signed-in";

const STAGGER_MS = 60;

/** Masthead: full width ruled bar, sticky. Mobile: full-height panel, staggered links (60ms, 24px rise, <= 400ms total). */
export function SiteHeader() {
  const pathname = usePathname();
  const signedIn = useSignedIn();
  const main = sessionCta(signedIn, { href: "/sign-in", label: "Inspect a repo free" });
  // The menu counts as open only on the page it was opened on, so navigating closes it without an effect.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpenFor(null);
    toggleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>("a")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const items = [toggleRef.current, ...Array.from(panelRef.current?.querySelectorAll<HTMLElement>("a, button") ?? [])].filter(
        (x): x is HTMLElement => !!x,
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (!items.includes(active as HTMLElement)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const isCurrent = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));
  const navLinks = [{ href: "/", label: "Product" }, ...product.nav];
  const linkClass = (href: string) =>
    cn(
      "inline-flex min-h-11 items-center px-1 button-sm transition-colors duration-300 ease-out-kit hover:text-text focus-visible:focus-ring",
      isCurrent(href) ? "text-text underline decoration-action decoration-2 underline-offset-8" : "text-text-subtle",
    );

  const panelItems = [
    ...navLinks.map((n) => ({ ...n, kind: "link" as const })),
    ...(signedIn ? [] : [{ href: "/sign-in", label: "Sign in", kind: "link" as const }]),
    { ...main, kind: "cta" as const },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-border-strong bg-surface">
      <div className="relative z-50 mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-2 sm:px-6 lg:px-8">
        <Link href="/" className="inline-flex min-h-11 items-center rounded-md focus-visible:focus-ring">
          <BrandLockup />
        </Link>
        <nav aria-label="Primary" className="hidden items-center gap-8 md:flex lg:ml-12 lg:mr-auto">
          {navLinks.map((n) => (
            <Link key={n.href} href={n.href} aria-current={isCurrent(n.href) ? "page" : undefined} className={linkClass(n.href)}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          {/* Space is reserved while signed in (invisible, not removed) so nothing shifts when the label swaps. */}
          <Link href="/sign-in" aria-hidden={signedIn || undefined} tabIndex={signedIn ? -1 : undefined} className={cn("button-sm hidden min-h-11 items-center text-text-subtle hover:text-text focus-visible:focus-ring md:inline-flex", signedIn && "md:invisible")}>Sign in</Link>
          <Link href={main.href} className={cn(buttonClass(signedIn ? "primary" : "secondary", "md"), "button-sm max-sm:hidden")}>{main.label}</Link>
          <button
            ref={toggleRef}
            type="button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => (open ? close() : setOpenFor(pathname))}
            className="inline-flex size-11 items-center justify-center rounded-md text-text transition-colors duration-300 ease-out-kit hover:bg-surface focus-visible:focus-ring md:hidden"
          >
            <span aria-hidden className="relative block size-6">
              <span className={cn("absolute left-1 right-1 top-2 h-0.5 rounded-sm bg-current transition-transform duration-300 ease-out-kit", open && "translate-y-1 rotate-45")} />
              <span className={cn("absolute bottom-2 left-1 right-1 h-0.5 rounded-sm bg-current transition-transform duration-300 ease-out-kit", open && "-translate-y-1 -rotate-45")} />
            </span>
          </button>
        </div>
      </div>

      <div
        ref={panelRef}
        id="mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        inert={!open}
        className={cn(
          "fixed inset-0 z-40 flex h-dvh flex-col bg-surface px-4 pt-24 transition-opacity duration-300 ease-out-kit md:hidden",
          open ? "visible opacity-100" : "invisible opacity-0",
        )}
      >
        <nav aria-label="Mobile" className="flex flex-col">
          {panelItems.map((item, i) => (
            <Link
              key={item.label}
              href={item.href}
              aria-current={item.kind === "link" && isCurrent(item.href) && item.label !== "Sign in" ? "page" : undefined}
              onClick={() => setOpenFor(null)}
              style={{ transitionDelay: open ? `${Math.min(i * STAGGER_MS, 400)}ms` : "0ms" }}
              className={cn(
                "transition-[opacity,transform] duration-400 ease-out-kit focus-visible:focus-ring motion-reduce:transform-none",
                open ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
                item.kind === "cta"
                  ? cn(buttonClass("primary", "lg"), "mt-8")
                  : "heading-4 flex min-h-12 items-center border-b border-border py-2 text-text aria-[current=page]:text-link",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
