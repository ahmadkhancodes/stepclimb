import Link from "next/link";
import { product } from "@/config/product";
import { BrandLockup } from "./demo/brand-lockup";

const columns = [
  {
    title: "Product",
    links: [
      { href: "/pricing", label: "Pricing" },
      { href: "/docs", label: "Docs" },
      { href: "/compare/laravelshift", label: "Compare" },
      { href: "/security", label: "Security" },
      { href: "/sign-in", label: "Sign in" },
    ],
  },
  {
    title: "Guides",
    links: [
      { href: "/guides", label: "All guides" },
      { href: "/laravel-12-to-13", label: "Laravel 12 to 13" },
      { href: "/laravel-11-to-12", label: "Laravel 11 to 12" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/legal/privacy", label: "Privacy" },
      { href: "/legal/terms", label: "Terms" },
      { href: "/legal/dpa", label: "DPA" },
      { href: "/legal/subprocessors", label: "Sub processors" },
    ],
  },
] as const;

const linkClass =
  "inline-flex min-h-11 items-center rounded-sm body-6 text-text-subtle transition-colors duration-300 ease-out-kit hover:text-text focus-visible:focus-ring";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface-raised">
      <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 md:py-16 lg:px-8">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="flex flex-col gap-4 md:col-span-4">
            <Link href="/" className="w-fit rounded-md focus-visible:focus-ring" aria-label={`${product.fullName} home`}><BrandLockup /></Link>
            <p className="body-6 max-w-xs text-text-subtle">{product.tagline}.</p>
            <p className="caption-4 text-text-subtle">A BufferSol product</p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:col-span-8 md:grid-cols-4">
            {columns.slice(0, 2).map((col) => (
              <nav key={col.title} aria-label={col.title} className="flex flex-col">
                <p className="caption-3 mb-2 uppercase tracking-wider text-text">{col.title}</p>
                {col.links.map((l) => <Link key={l.href} href={l.href} className={linkClass}>{l.label}</Link>)}
              </nav>
            ))}
            <nav aria-label="Company" className="flex flex-col">
              <p className="caption-3 mb-2 uppercase tracking-wider text-text">Company</p>
              <a href={product.companyUrl} className={linkClass}>{product.company}</a>
              <a href={`mailto:${product.supportEmail}`} className={linkClass}>Contact support</a>
            </nav>
            {columns.slice(2).map((col) => (
              <nav key={col.title} aria-label={col.title} className="flex flex-col">
                <p className="caption-3 mb-2 uppercase tracking-wider text-text">{col.title}</p>
                {col.links.map((l) => <Link key={l.href} href={l.href} className={linkClass}>{l.label}</Link>)}
              </nav>
            ))}
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-border pt-6 md:flex-row md:items-center md:justify-between">
          <p className="caption-5 max-w-xl text-text-subtle">Laravel is a trademark of Laravel Holdings Inc. Stepclimb by BufferSol is not affiliated.</p>
          <p className="caption-5 text-text-subtle">&copy; {new Date().getFullYear()} {product.company}</p>
        </div>
      </div>
    </footer>
  );
}
