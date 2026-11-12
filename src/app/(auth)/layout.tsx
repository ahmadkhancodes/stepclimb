import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";
import { product } from "@/config/product";
import { BrandLockup } from "@/components/marketing/demo/brand-lockup";
import { eolEntries } from "@/components/marketing/dateline";
import { formatIso } from "@/content/dates";

/** What happens after sign in, as a short logbook procedure. Facts only, no numbers we cannot back. */
const STEPS = [
  "Install the GitHub App on the repos you choose.",
  "Each repo gets a free inspection from composer.json, composer.lock and package.json. No code is cloned.",
  "Open a work order when you are ready. The pull request arrives verified, or says plainly why not.",
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-surface lg:grid-cols-12">
      <div className="flex flex-col lg:col-span-7">
        <header className="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-10">
          <Link href="/" className="inline-flex min-h-11 items-center focus-visible:focus-ring"><BrandLockup /></Link>
        </header>
        <main id="main" className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:px-10">
          <div className="mx-auto flex w-full max-w-md flex-col gap-8">{children}</div>
        </main>
        <footer className="px-4 py-6 sm:px-6 lg:px-10">
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 body-6 text-text-subtle transition-colors duration-300 hover:text-text focus-visible:focus-ring">
            <ArrowLeft size={16} weight="regular" aria-hidden />
            Back to {product.name}
          </Link>
        </footer>
      </div>
      <aside aria-label="What happens next" className="hidden flex-col justify-center border-l border-border-strong bg-surface-raised px-10 py-16 lg:col-span-5 lg:flex xl:px-16">
        <p className="label-log rule-double pt-3 text-text">What happens next</p>
        <ol className="mt-8 flex flex-col">
          {STEPS.map((s, i) => (
            <li key={s} className="grid grid-cols-[2.5rem_1fr] gap-2 border-b border-border py-4 first:border-t first:border-t-text">
              <span className="mono-data caption-1 text-action">{String(i + 1).padStart(2, "0")}</span>
              <span className="body-6 text-text">{s}</span>
            </li>
          ))}
        </ol>
        <p className="label-log mt-12 text-text-subtle">Security support ends</p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
          {eolEntries().map((e) => (
            <div key={e.label} className="contents">
              <dt className="caption-1 text-text">{e.label}</dt>
              <dd className="mono-data caption-1 text-text-subtle"><time dateTime={e.iso}>{formatIso(e.iso)}</time></dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}
