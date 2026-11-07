import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { Faq, type FaqItem } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";
import { A, ArticleSection, Bulletin, Mono, P, UL } from "@/components/content/prose";
import { FactTable } from "@/components/content/fact-table";
import { PageHeader } from "@/components/content/page-header";
import { JsonLd } from "@/components/content/json-ld";
import { product } from "@/config/product";
import { absoluteUrl, pageMetadata } from "@/lib/seo";

const path = "/security";
const title = "Security and code custody";
const description =
  "Where your code goes when Stepclimb runs an upgrade: an isolated sandbox per run, an egress allow list, repo scoped tokens, no retained code and no AI service.";

export const metadata = pageMetadata({ title, description, path });

const lines = [
  { n: "1", head: "One sandbox per run", body: "Each run gets its own sandbox with no host mounts. It is destroyed when the run ends." },
  { n: "2", head: "Network allow list", body: "The sandbox can reach package registries and GitHub, nothing else. Blocked hosts are logged." },
  { n: "3", head: "Tokens stay outside", body: "Installation tokens are scoped to one repo and expire within an hour. The sandbox never holds them." },
  { n: "4", head: "No retained code", body: "We do not retain customer code. Logs are kept 30 days with secrets redacted." },
];

const faq: FaqItem[] = [
  {
    q: "Do you clone my private code?",
    a: "Only when you ask for an upgrade run. The code goes into an isolated sandbox that is destroyed when the run ends, and we do not retain it. A free inspection does not clone anything: it reads composer.json, composer.lock and package.json only.",
  },
  {
    q: "Does any AI service see my code?",
    a: "No. Recipes and repair rules make the changes, and nothing is sent to an AI service. The prompts we attach to squawks are templates for your own agent.",
  },
  {
    q: "Can Stepclimb merge into my main branch?",
    a: "No. Stepclimb opens a pull request and never merges. Merging stays with you.",
  },
  {
    q: "Do you have SOC 2 or ISO 27001 certification?",
    a: "No. We do not claim any certification. This page lists what we do, and nothing we do not do.",
  },
  {
    q: "Who are your sub processors?",
    a: "The table on this page lists them. In the first release Vercel, MongoDB Atlas and Cloudflare are infrastructure sub processors, alongside Stripe for payments and an email delivery provider. We will give 14 days notice before adding or replacing one.",
  },
];

export default function SecurityPage() {
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
        crumbs={[{ label: "Home", href: "/" }, { label: "Security" }]}
        title="Where your code goes, in four lines"
        lede="Stepclimb runs your upgrade in a sandbox that exists for one run. This page says what that means, what we keep and who else is involved."
        actions={
          <>
            <ButtonLink href="/sign-in" size="lg">Inspect a repo free</ButtonLink>
            <ButtonLink href="/legal/subprocessors" size="lg" variant="tertiary">Sub processor list</ButtonLink>
          </>
        }
      />
      <Container className="flex flex-col gap-16 py-12 md:py-20">
        <section aria-label="Code custody in four lines">
          <ol className="grid border border-border bg-surface-raised md:grid-cols-2">
            {lines.map((l) => (
              <li key={l.n} className="flex flex-col gap-2 border-b border-border p-6 last:border-b-0 md:odd:border-r md:[&:nth-last-child(2)]:border-b-0">
                <span className="mono-data caption-3 text-text-muted">Line {l.n}</span>
                <h2 className="heading-6 text-text">{l.head}</h2>
                <p className="body-3 text-text-subtle">{l.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <ArticleSection id="inspection" title="What a free inspection reads">
          <P>
            The free inspection reads <Mono>composer.json</Mono>, <Mono>composer.lock</Mono> and <Mono>package.json</Mono> only (plus the list of file names, to find each app), through the GitHub App you install on the repositories you choose. No code is cloned. The report shows versions behind, the support end date, the recipes that apply and an effort band from S to XL.
          </P>
        </ArticleSection>

        <ArticleSection id="runs" title="What an upgrade run does">
          <UL
            items={[
              "The repo is cloned into a fresh sandbox. Recipes apply as one commit each, then composer install, your asset build and your tests run.",
              "If something breaks, repair rules match known failures and re run up to three times. Nothing is sent to an AI service.",
              "A run stops at 25 minutes. The sandbox is destroyed in every case, success or failure.",
              "The pull request, its comments and the Verified check are created by our servers, outside the sandbox. We never merge.",
            ]}
          />
          <Bulletin label="Honest note">
            Your test suite runs in the sandbox, so it can run any code your repository contains. That is why the sandbox has no host mounts and can reach only package registries and GitHub.
          </Bulletin>
        </ArticleSection>

        <ArticleSection id="account" title="Account and application security">
          <UL
            items={[
              "Sign in uses GitHub, with optional two factor authentication. The free tier needs a GitHub account at least 30 days old.",
              "API keys are shown once and stored hashed. Outbound webhooks are signed so you can verify them.",
              "Incoming webhooks from GitHub and Stripe are signature checked.",
              "Rate limits protect public endpoints and the API.",
            ]}
          />
        </ArticleSection>

        <ArticleSection id="subprocessors" title="Sub processors">
          <P>
            In the first release we run on shared infrastructure providers, so the list is longer than one entry. It is the same list as on <A href="/legal/subprocessors">the sub processor page</A>, and it comes from our product configuration.
          </P>
          <FactTable
            caption="Sub processors"
            columns={["Provider", "Purpose", "Location"]}
            minWidth="min-w-144"
            rows={product.subProcessors.map((s) => [s.name, s.purpose, s.location])}
          />
        </ArticleSection>

        <ArticleSection id="reporting" title="Report a vulnerability">
          <P>
            Email <A href={`mailto:${product.legalEmail}`}>{product.legalEmail}</A> with the details and steps to reproduce. Please give us reasonable time to fix the issue before you disclose it. We will not take legal action against honest research. More on the <A href="/legal/security">security policy</A> and the <A href="/legal/dpa">data processing addendum</A>.
          </P>
        </ArticleSection>
      </Container>
      <Faq title="Common questions" items={faq} />
      <FinalCta
        title="Start with a report that clones nothing"
        body="The free inspection reads composer.json, composer.lock and package.json only. No code is cloned."
        cta={{ href: "/sign-in", label: "Inspect a repo free" }}
        note="Free inspection first. Cancel at period end. Pause up to 3 months."
      />
    </>
  );
}
