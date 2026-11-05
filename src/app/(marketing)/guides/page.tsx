import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { Container } from "@/components/ui/layout";
import { FinalCta } from "@/components/marketing/final-cta";
import { PageHeader } from "@/components/content/page-header";
import { JsonLd } from "@/components/content/json-ld";
import { guides } from "@/content/guides";
import { comparisons } from "@/content/compare";
import { product } from "@/config/product";
import { absoluteUrl, pageMetadata } from "@/lib/seo";

const description =
  "Dated, sourced guides for Laravel upgrades: the Laravel and PHP end of life calendar and upgrade checklists for Laravel 11 to 12 and 12 to 13.";

export const metadata = pageMetadata({ title: "Guides", description, path: "/guides" });

export default function GuidesPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `Guides · ${product.fullName}`,
    description,
    url: absoluteUrl("/guides"),
    hasPart: guides.map((g) => ({ "@type": "TechArticle", headline: g.title, url: absoluteUrl(g.path) })),
  };
  return (
    <>
      <JsonLd data={jsonLd} />
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Guides" }]}
        title="Guides for Laravel upgrades"
        lede="Every guide carries the date it was checked and links to its sources. If a fact is not sourced, it is not here."
      />
      <Container className="flex flex-col gap-16 py-12 md:py-20">
        <section aria-labelledby="guides-h" className="flex flex-col gap-4">
          <h2 id="guides-h" className="heading-5 text-text">All guides</h2>
          <ul className="border border-border bg-surface-raised">
            {guides.map((g) => (
              <li key={g.path} className="border-b border-border last:border-b-0">
                <Link
                  href={g.path}
                  className="grid gap-x-6 gap-y-2 px-4 py-6 hover:bg-surface-sunken focus-visible:focus-ring md:grid-cols-12 md:items-start md:px-6"
                >
                  <span className="stamp-text text-text-muted md:col-span-2">{g.kind}</span>
                  <span className="flex flex-col gap-1 md:col-span-8">
                    <span className="heading-6 text-text">{g.title}</span>
                    <span className="body-6 text-text-subtle">{g.description}</span>
                    <span className="mono-data caption-4 text-text-muted">Checked {g.updated.label}</span>
                  </span>
                  <span className="body-6 flex items-center gap-1 text-action md:col-span-2 md:justify-self-end">
                    Read<ArrowRight size={16} weight="regular" aria-hidden />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="compare-h" className="flex flex-col gap-4">
          <h2 id="compare-h" className="heading-5 text-text">Comparisons</h2>
          <ul className="flex max-w-2xl flex-col gap-2">
            {comparisons.map((c) => (
              <li key={c.slug}>
                <Link href={`/compare/${c.slug}`} className="body-3 text-action underline underline-offset-4 hover:text-action-hover focus-visible:focus-ring">
                  {c.title}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/compare/ai-agents" className="body-3 text-action underline underline-offset-4 hover:text-action-hover focus-visible:focus-ring">
                {product.fullName} compared with AI coding agents
              </Link>
            </li>
          </ul>
        </section>
      </Container>
      <FinalCta
        title="Find out how far behind your repos are"
        body="The free inspection reads composer.json and composer.lock only. No code is cloned."
        cta={{ href: "/sign-in", label: "Inspect a repo free" }}
        note="Free inspection first. Cancel at period end. Pause up to 3 months."
      />
    </>
  );
}
