import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { Container } from "@/components/ui/layout";
import { PageHeader } from "@/components/content/page-header";
import { docGroups } from "@/content/docs";
import { product } from "@/config/product";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Documentation",
  description: `Guides and reference for the ${product.name} API, authentication, billing and webhooks.`,
  path: "/docs",
});

/** Docs index as a ruled table of contents: group label in the margin, one hairline per document. */
export default function DocsIndexPage() {
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Docs" }]}
        title="Documentation"
        lede={`How to connect your GitHub repos, read an inspection, review a work order, and call the ${product.name} API.`}
      />
      <Container className="pb-16 pt-8 md:pb-24 md:pt-12">
        <div className="flex flex-col">
          {docGroups.map((g) => (
            <section key={g.title} aria-labelledby={`g-${g.title}`} className="grid gap-4 border-t border-text py-8 lg:grid-cols-12 lg:gap-12">
              <h2 id={`g-${g.title}`} className="label-log text-text lg:col-span-3 lg:pt-2">{g.title}</h2>
              <ul className="lg:col-span-9">
                {g.docs.map((d) => (
                  <li key={d.slug} className="border-b border-border last:border-b-0">
                    <Link href={`/docs/${d.slug}`} className="group grid min-h-11 gap-1 py-4 focus-visible:focus-ring md:grid-cols-[1fr_auto] md:items-baseline md:gap-6">
                      <span className="heading-6 text-text group-hover:text-link">{d.title}</span>
                      <span className="body-6 text-text-subtle md:col-start-1">{d.description}</span>
                      <ArrowRight size={16} weight="regular" aria-hidden className="hidden text-link md:row-start-1 md:col-start-2 md:block" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Container>
    </>
  );
}
