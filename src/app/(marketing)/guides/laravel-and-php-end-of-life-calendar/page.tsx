import { ButtonLink } from "@/components/ui/button";
import { Faq, type FaqItem } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";
import { ArticleLayout } from "@/components/content/article-layout";
import { A, ArticleSection, Bulletin, Mono, P, Sources } from "@/components/content/prose";
import { FactTable } from "@/components/content/fact-table";
import { StatusChip } from "@/components/content/status-chip";
import { PageHeader } from "@/components/content/page-header";
import { JsonLd } from "@/components/content/json-ld";
import { CHECKED, formatIso } from "@/content/dates";
import { guides } from "@/content/guides";
import { EOL_CALENDAR } from "@/lib/engine/detect/eol";
import { product } from "@/config/product";
import { absoluteUrl, pageMetadata } from "@/lib/seo";

const g = guides.find((x) => x.path === "/guides/laravel-and-php-end-of-life-calendar")!;

export const metadata = pageMetadata({ title: g.title, description: g.description, path: g.path });

const today = new Date(`${CHECKED.iso}T00:00:00Z`);

function Status({ iso }: { iso: string | null }) {
  if (!iso) return <StatusChip state="unknown">Date not entered yet</StatusChip>;
  const days = Math.round((Date.parse(`${iso}T00:00:00Z`) - today.getTime()) / 86_400_000);
  return days < 0 ? <StatusChip state="ended">Ended {Math.abs(days)} days ago</StatusChip> : <StatusChip state="supported">{days} days left</StatusChip>;
}

const faq: FaqItem[] = [
  {
    q: "How long does each Laravel major get security fixes?",
    a: "Each Laravel major gets 18 months of bug fixes and 2 years of security fixes, according to the Laravel release notes. Laravel ships a new major around the first quarter of each year.",
  },
  {
    q: "Is Laravel 11 still supported?",
    a: "No. Security fixes for Laravel 11 ended on 12 Mar 2026, according to the Laravel release notes. The next step is Laravel 12, which is covered by security fixes until 24 Feb 2027.",
  },
  {
    q: "When does PHP 8.2 stop getting security fixes?",
    a: "PHP 8.2 security support ends on 31 Dec 2026, according to php.net. Laravel 13 needs PHP 8.3 or newer, so moving off PHP 8.2 and moving to Laravel 13 go together.",
  },
  {
    q: "Where is the date for Laravel 13?",
    a: "Our calendar has no security end date for Laravel 13 yet, and we do not guess one. The release notes at laravel.com are the source. We add the date here after a person has checked it.",
  },
];

export default function EolCalendarPage() {
  const laravelRows = EOL_CALENDAR.laravel.map((e) => [
    `Laravel ${e.major}`,
    e.securityEnd ? formatIso(e.securityEnd) : "Not in our calendar yet",
    <Status key={e.major} iso={e.securityEnd} />,
  ]);
  const phpRows = EOL_CALENDAR.php.map((e) => [`PHP ${e.version}`, formatIso(e.securityEnd), <Status key={e.version} iso={e.securityEnd} />]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: g.title,
    description: g.description,
    url: absoluteUrl(g.path),
    dateModified: CHECKED.iso,
    publisher: { "@type": "Organization", name: product.company, url: product.companyUrl },
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Guides", href: "/guides" }, { label: "End of life calendar" }]}
        title={g.title}
        lede="The dates security fixes end for the Laravel majors and the PHP version most of them run on, with the day each one was checked. Only dates we could source are listed."
        meta={`Checked ${CHECKED.label}. Day counts are as of that date.`}
        actions={<ButtonLink href="/sign-in" size="lg">Inspect a repo free</ButtonLink>}
      />
      <ArticleLayout
        toc={[
          { id: "laravel", label: "Laravel" },
          { id: "php", label: "PHP" },
          { id: "policy", label: "How support works" },
          { id: "sources", label: "Sources" },
        ]}
      >
        <ArticleSection id="laravel" title="Laravel security fix end dates">
          <FactTable caption={`Laravel security fix end dates, checked ${CHECKED.label}`} columns={["Release", "Security fixes end", "Status"]} minWidth="min-w-120" rows={laravelRows} />
          <Bulletin label="Laravel 13">
            We have not entered a security end date for Laravel 13. Read it from the Laravel release notes linked under sources, not from us, until we add it.
          </Bulletin>
        </ArticleSection>

        <ArticleSection id="php" title="PHP security fix end dates">
          <FactTable caption={`PHP security fix end dates, checked ${CHECKED.label}`} columns={["Version", "Security fixes end", "Status"]} minWidth="min-w-120" rows={phpRows} />
          <P>
            Laravel 13 requires PHP 8.3 or newer. Laravel 12 supports PHP 8.2 to 8.5. For the end dates of other PHP versions, use the php.net table linked below.
          </P>
        </ArticleSection>

        <ArticleSection id="policy" title="How support works">
          <P>
            Laravel ships a major release around the first quarter of each year. Each major gets 18 months of bug fixes and 2 years of security fixes. After the security date, a Laravel app on that major gets no further framework fixes, and a security questionnaire from a client or a <Mono>composer audit</Mono> report is where teams usually notice.
          </P>
          <P>
            Upgrade guides for the two nearest hops: <A href="/laravel-11-to-12">Laravel 11 to 12</A> and <A href="/laravel-12-to-13">Laravel 12 to 13</A>.
          </P>
        </ArticleSection>

        <ArticleSection id="sources" title="Sources and method">
          <P>
            Dates are copied from the sources below by a person and reviewed before they go into our calendar. If you see a difference, write to <A href={`mailto:${product.supportEmail}`}>{product.supportEmail}</A> and we will check it.
          </P>
          <Sources
            checked={CHECKED.label}
            items={[
              { label: "Laravel 13.x release notes and support policy", href: "https://laravel.com/docs/13.x/releases" },
              { label: "PHP supported versions", href: "https://www.php.net/supported-versions.php" },
            ]}
          />
        </ArticleSection>
      </ArticleLayout>
      <Faq title="Common questions" items={faq} />
      <FinalCta
        title="See which of your repos are past their date"
        body="The free inspection reads composer.json and composer.lock only. No code is cloned."
        cta={{ href: "/sign-in", label: "Inspect a repo free" }}
        note="Free inspection first. Cancel at period end. Pause up to 3 months."
      />
    </>
  );
}
