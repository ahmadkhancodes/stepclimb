import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { PricingTable } from "@/components/marketing/pricing-table";
import { Faq, type FaqItem } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";
import { A, ArticleSection, P } from "@/components/content/prose";
import { FactTable } from "@/components/content/fact-table";
import { PageHeader } from "@/components/content/page-header";
import { JsonLd } from "@/components/content/json-ld";
import { COMPARED } from "@/content/dates";
import { MAX_REPOS, MAX_SEATS, oneOffs, plans, product, type Plan } from "@/config/product";
import { absoluteUrl, pageMetadata } from "@/lib/seo";

const path = "/pricing";
const title = "Pricing";
const description =
  "Stepclimb pricing: a free inspection, one time upgrades from $9.99, Solo at $49 per repo per year, Studio at $449 a year and Agency at $99 a month. Compared with laravelshift.com on 3 Nov 2026.";

export const metadata = pageMetadata({ title, description, path });

const extended = oneOffs.find((o) => o.kind === "extended_verify");
const extendedPrice = extended ? `$${(extended.usd / 100).toFixed(2)}` : "";

const reposCell = (p: Plan) => {
  if (p.prices.length === 0) return "Inspection only";
  if (p.limits.repos >= MAX_REPOS) return "Unlimited";
  return "1 per repo bought";
};
const seatsCell = (p: Plan) => (p.limits.seats >= MAX_SEATS ? "Unlimited" : String(p.limits.seats));
const verifyCell = (p: Plan) => (p.limits.extended_verify >= 1_000_000 ? "On every run" : `+${extendedPrice} per run`);
const publicCell = (p: Plan) => `${p.limits.public_prs} a month`;

const faq: FaqItem[] = [
  {
    q: "What does the free inspection include?",
    a: "Unlimited inspection reports, and one upgrade pull request a month on public open source repos. The inspection reads composer.json, composer.lock and package.json only, so no code is cloned.",
  },
  {
    q: "What is the difference between Solo and Legacy Solo?",
    a: "Solo covers upgrades to current majors for one repo at $49 per repo per year. Legacy Solo is $74 per repo every 6 months and covers every supported hop from older majors. Hops from Laravel 10 to 11 onward are supported at launch, 8.x and 9.x in v1 and older ones in v2.",
  },
  {
    q: "What does a one time upgrade include?",
    a: "One verified pull request with the repair pass included, and 14 days of re runs on the same branch. Extended verification is an add on: a PHP 8.3, 8.4 and 8.5 matrix, a 60 minute limit and 5 repair loops.",
  },
  {
    q: "Is Studio or Agency better for an agency?",
    a: "Studio is $449 a year for unlimited repos on current versions with 5 seats and a fleet dashboard. Agency is $99 a month, or $999 a year, with unlimited repos and seats, white label client reports (v1), a priority queue and extended verification on every run.",
  },
  {
    q: "Can I cancel or pause?",
    a: "You can cancel at period end, and the plan stays active until the period you paid for is over. You can pause for up to 3 months.",
  },
  {
    q: "Which currency do you bill in?",
    a: "US dollars. Prices are shown in USD only.",
  },
  {
    q: "Do you issue invoices with a tax ID?",
    a: "Yes. Invoices can carry a VAT or GST number. Prices exclude taxes, which are added where required.",
  },
  {
    q: "What if I have more than 200 repos or need SSO?",
    a: "That is an Enterprise quote. Write to us from the Talk to us button on the rate card.",
  },
];

export default function PricingPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: absoluteUrl(path),
    publisher: { "@type": "Organization", name: product.company, url: product.companyUrl },
  };
  return (
    <>
      <JsonLd data={jsonLd} />
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Pricing" }]}
        title="Pricing"
        lede="Same core jobs, about half the price of laravelshift.com on every comparable plan, with verification included and no third party AI touching your code."
        meta={`Prices compared on ${COMPARED.label}`}
        actions={<ButtonLink href="/compare/laravelshift" size="lg" variant="tertiary">See the price by price comparison</ButtonLink>}
      />
      <Container className="flex flex-col gap-16 py-12 md:py-20">
        <PricingTable id="rate-card" />

        <ArticleSection id="limits" title="Plan limits">
          <P>
            Limits come straight from the plan configuration that checkout uses. Solo plans are priced per repo, and the quantity you pick at checkout is the number of repos.
          </P>
          <FactTable
            caption="Plan limits"
            columns={["Plan", "Repos", "Seats", "Extended verification", "Public repo PRs"]}
            minWidth="min-w-176"
            rows={plans.map((p) => [p.name, reposCell(p), seatsCell(p), verifyCell(p), publicCell(p)])}
          />
          <P>
            Extended verification means a PHP 8.3, 8.4 and 8.5 matrix, a 60 minute limit and 5 repair loops. Public repo PRs are the free tier allowance on open source repositories. Compare with other tools on <A href="/compare/laravelshift">the laravelshift.com page</A>.
          </P>
        </ArticleSection>
      </Container>
      <Faq title="Pricing questions" items={faq} />
      <FinalCta
        title="Find out how far behind your repos are"
        body="The free inspection reads composer.json, composer.lock and package.json only. No code is cloned."
        cta={{ href: "/sign-in", label: "Inspect a repo free" }}
        note="Free inspection first. Cancel at period end. Pause up to 3 months."
      />
    </>
  );
}
