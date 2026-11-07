import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { CompareTable } from "@/components/marketing/compare-table";
import { Faq } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";
import { ArticleSection, P, UL, A, Sources, Bulletin } from "@/components/content/prose";
import { FactTable } from "@/components/content/fact-table";
import { PageHeader } from "@/components/content/page-header";
import { JsonLd } from "@/components/content/json-ld";
import { comparisonBySlug, comparisons } from "@/content/compare";
import { product } from "@/config/product";
import { absoluteUrl, pageMetadata } from "@/lib/seo";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return comparisons.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = comparisonBySlug(slug);
  if (!entry) return {};
  return pageMetadata({ title: entry.title, description: entry.description, path: `/compare/${entry.slug}` });
}

export default async function ComparePage({ params }: Props) {
  const { slug } = await params;
  const entry = comparisonBySlug(slug);
  if (!entry) notFound();
  const path = `/compare/${entry.slug}`;
  const checked = entry.checked;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: entry.title,
    description: entry.description,
    url: absoluteUrl(path),
    ...(checked ? { dateModified: checked.iso } : {}),
    publisher: { "@type": "Organization", name: product.company, url: product.companyUrl },
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Compare" }, { label: entry.competitor }]}
        title={entry.headline}
        lede={entry.intro}
        meta={checked ? `Compared ${checked.label}` : undefined}
        actions={
          <>
            <ButtonLink href="/sign-in" size="lg">Inspect a repo free</ButtonLink>
            <ButtonLink href="/pricing" size="lg" variant="tertiary">See our pricing</ButtonLink>
          </>
        }
      />
      <Container className="flex flex-col gap-16 py-12 md:py-20">
        <ArticleSection id="at-a-glance" title="At a glance">
          <CompareTable
            caption={`${product.name} compared with ${entry.competitor}`}
            columns={[entry.competitor, product.name]}
            highlightColumn={1}
            rows={entry.rows.map((r) => ({ label: r.label, values: [...r.values] }))}
          />
        </ArticleSection>

        {entry.priceTable ? (
          <ArticleSection id="prices" title="Price by price">
            <P>
              Our prices come from our rate card. Theirs are the figures observed on {checked?.label ?? "the date above"}. We do not match
              every product one to one, so rows pair the closest job. The full rate card is on <A href="/pricing">the pricing page</A>.
            </P>
            <FactTable
              caption={`Price list of ${entry.competitor} and ${product.name}, USD`}
              columns={entry.priceTable.head}
              rows={entry.priceTable.rows}
              highlight={2}
              mono={[1, 2]}
              minWidth="min-w-160"
            />
            <P>
              Agency is capped at $99 a month, which is about 40% of the monthly equivalent of the Everything plan ($249.92 a month).
              Agency also includes unlimited seats and white label reports (v1).
            </P>
          </ArticleSection>
        ) : null}

        {entry.betterFit ? (
          <ArticleSection id="better-fit" title={`Where ${entry.competitor} is the better fit`}>
            <UL items={entry.betterFit} />
            <Bulletin label="Legacy versions">{entry.fitNote}</Bulletin>
          </ArticleSection>
        ) : null}

        <ArticleSection id="sources" title="Sources and method">
          <P>
            Every figure about {entry.competitor} was read from its public pages and noted in our research on {checked?.label ?? "the date above"}.
            Where we cite a third party review or a founder statement, the text says so. Prices change. If you spot a difference, write to{" "}
            <A href={`mailto:${product.supportEmail}`}>{product.supportEmail}</A> and we will correct the page.
          </P>
          {entry.sources && checked ? <Sources checked={checked.label} items={entry.sources} /> : null}
        </ArticleSection>
      </Container>
      <Faq title="Common questions" items={entry.faq} />
      <FinalCta
        title="Find out how far behind your repos are"
        body="The free inspection reads composer.json, composer.lock and package.json only. No code is cloned."
        cta={{ href: "/sign-in", label: "Inspect a repo free" }}
        note="Free inspection first. Cancel at period end. Pause up to 3 months."
      />
    </>
  );
}
