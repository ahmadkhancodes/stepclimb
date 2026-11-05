import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Faq, type FaqItem } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";
import { ArticleLayout, type TocItem } from "@/components/content/article-layout";
import { ArticleSection, Bulletin, Mono, OL, P, Sources } from "@/components/content/prose";
import { FactTable } from "@/components/content/fact-table";
import { StatusChip } from "@/components/content/status-chip";
import { PageHeader } from "@/components/content/page-header";
import { JsonLd } from "@/components/content/json-ld";
import { CHECKED, formatIso } from "@/content/dates";
import { eolStatus, securityEnd } from "@/lib/engine/detect/eol";
import { oneOffs, product } from "@/config/product";
import { absoluteUrl } from "@/lib/seo";

export interface UpgradeGuideProps {
  from: 11 | 12;
  to: 12 | 13;
  path: string;
  title: string;
  lede: string;
  phpNote: string;
  /** composer.json lines the official guide lists. */
  composerRows: string[][];
  /** Steps in order. */
  steps: { id: string; title: string; body: ReactNode }[];
  /** What Stepclimb's recipes do for this hop, one line each. */
  recipes: string[];
  oneOffKind: "to_latest" | "to_previous";
  sources: { label: string; href: string }[];
  faq: FaqItem[];
}

function SupportCell({ major }: { major: number }) {
  const s = eolStatus(major, new Date(`${CHECKED.iso}T00:00:00Z`));
  const end = securityEnd(major);
  if (!end || s.days === null) return <>Date not in our calendar yet. See laravel.com</>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="mono-data">{formatIso(end)}</span>
      <StatusChip state={s.state}>{s.state === "ended" ? `Ended ${Math.abs(s.days)} days ago` : `${s.days} days left`}</StatusChip>
    </span>
  );
}

/** One upgrade hop guide: dated, sourced, with a plain mention of the product at the end. */
export function UpgradeGuide(p: UpgradeGuideProps) {
  const oneOff = oneOffs.find((o) => o.kind === p.oneOffKind);
  const price = oneOff ? `$${(oneOff.usd / 100).toFixed(2)}` : "";
  const toc: TocItem[] = [
    { id: "support", label: "Support dates" },
    { id: "composer", label: "composer.json" },
    ...p.steps.map((s) => ({ id: s.id, label: s.title })),
    { id: "stepclimb", label: "What Stepclimb does" },
    { id: "sources", label: "Sources" },
  ];
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: p.title,
    description: p.lede,
    url: absoluteUrl(p.path),
    dateModified: CHECKED.iso,
    publisher: { "@type": "Organization", name: product.company, url: product.companyUrl },
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Guides", href: "/guides" }, { label: `Laravel ${p.from} to ${p.to}` }]}
        title={p.title}
        lede={p.lede}
        meta={`Checked ${CHECKED.label} against laravel.com`}
        actions={
          <>
            <ButtonLink href="/sign-in" size="lg">Inspect a repo free</ButtonLink>
            <ButtonLink href="/pricing" size="lg" variant="tertiary">See pricing</ButtonLink>
          </>
        }
      />
      <ArticleLayout toc={toc}>
        <ArticleSection id="support" title="Support dates">
          <FactTable
            caption={`Security fix end dates for Laravel ${p.from} and ${p.to}, checked ${CHECKED.label}`}
            columns={["Release", "Security fixes end"]}
            minWidth="min-w-96"
            rows={[
              [`Laravel ${p.from}`, <SupportCell key="a" major={p.from} />],
              [`Laravel ${p.to}`, <SupportCell key="b" major={p.to} />],
            ]}
          />
          <P>{p.phpNote}</P>
        </ArticleSection>

        <ArticleSection id="composer" title="Update composer.json">
          <P>
            The official upgrade guide lists these constraints. Change them, then run <Mono>composer update</Mono> and read the output for conflicts with your other packages.
          </P>
          <FactTable caption={`composer.json changes for Laravel ${p.to}`} columns={["Package", "Constraint", "Section"]} mono={[1]} minWidth="min-w-96" rows={p.composerRows} />
        </ArticleSection>

        {p.steps.map((s) => (
          <ArticleSection key={s.id} id={s.id} title={s.title}>
            {s.body}
          </ArticleSection>
        ))}

        <ArticleSection id="stepclimb" title="What Stepclimb does for this hop">
          <P>
            Each of these is one named recipe and one commit in the pull request. The pull request also carries a work order and the Verified check, which means <Mono>composer install</Mono>, your asset build and your tests ran in our sandbox first.
          </P>
          <OL items={p.recipes} />
          {oneOff ? (
            <Bulletin label="Price">
              {oneOff.name} is {price} for one verified pull request. A free inspection comes first, and it reads composer.json and composer.lock only.
            </Bulletin>
          ) : null}
        </ArticleSection>

        <ArticleSection id="sources" title="Sources and method">
          <P>
            Constraints and changes on this page come from the official Laravel documentation and were read on {CHECKED.label}. Support dates come from the Laravel release notes. If the official guide changes after that date, trust the official guide.
          </P>
          <Sources checked={CHECKED.label} items={p.sources} />
        </ArticleSection>
      </ArticleLayout>
      <Faq title="Common questions" items={p.faq} />
      <FinalCta
        title={`Find out what a move to Laravel ${p.to} needs in your repo`}
        body="The free inspection reads composer.json and composer.lock only. No code is cloned."
        cta={{ href: "/sign-in", label: "Inspect a repo free" }}
        note="Free inspection first. Cancel at period end. Pause up to 3 months."
      />
    </>
  );
}

