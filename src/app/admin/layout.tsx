import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Notice } from "@/components/ui/states";
import { product } from "@/config/product";
import { founderNeeds2fa, isFounderAdmin, requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

const nav = [{ href: "/admin", label: "Overview" }, { href: "/admin/runs", label: "Runs" }, { href: "/admin/rules", label: "Rules and paths" }];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const s = await requireUser({ redirectTo: "/admin" });
  if (!isFounderAdmin(s.user)) notFound();
  const needs2fa = founderNeeds2fa(s.user);
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2 sm:px-6 lg:px-10">
        <div className="flex flex-wrap items-center gap-4">
          <span className="heading-6 text-text">{product.name} admin</span>
          <nav aria-label="Admin" className="flex items-center gap-1">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="inline-flex min-h-11 items-center px-2 body-6 text-text-subtle transition-colors duration-300 hover:text-text focus-visible:focus-ring">{n.label}</Link>
            ))}
          </nav>
          <Link href="/app" className="inline-flex min-h-11 items-center gap-2 body-6 text-text-subtle transition-colors duration-300 hover:text-text focus-visible:focus-ring">
            <ArrowLeft size={16} weight="regular" aria-hidden />
            Back to app
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
        {needs2fa ? (
          <Notice tone="warning" title="Turn on two-factor sign in first" action={<Link href="/app/settings/security" className="button-sm inline-flex min-h-11 items-center text-link focus-visible:focus-ring">Open security settings</Link>}>
            The admin console is open to founder accounts with an authenticator app only.
          </Notice>
        ) : children}
      </main>
    </div>
  );
}
