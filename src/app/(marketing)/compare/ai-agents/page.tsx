import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/layout";
import { Faq, type FaqItem } from "@/components/marketing/faq";
import { FinalCta } from "@/components/marketing/final-cta";
import { ArticleSection, P, UL, A, Sources, Bulletin } from "@/components/content/prose";
import { FactTable } from "@/components/content/fact-table";
import { PageHeader } from "@/components/content/page-header";
import { JsonLd } from "@/components/content/json-ld";
import { COMPARED } from "@/content/dates";
import { product } from "@/config/product";
import { absoluteUrl, pageMetadata } from "@/lib/seo";

const path = "/compare/ai-agents";
const title = `${product.fullName} compared with AI coding agents`;
const description = `${product.name} against Laravel Boost, GitHub Copilot agent mode and other coding agents for Laravel upgrades: repeatable results, tokens, scheduling and a fleet view. Compared ${COMPARED.label}.`;

export const metadata: Metadata = pageMetadata({ title, description, path });

const faq: FaqItem[] = [
  {
    q: "Our AI agent can already upgrade Laravel. Why pay for a tool?",
    a: "An agent can do it, and for one app you are watching it may be enough. The differences show up with many repos and repeat runs: the same recipes make the known changes the same way every time, nothing uses your tokens, upgrades and dependency PRs are scheduled, and one board shows every repo. A person drives an agent one repo at a time.",
  },
  {
    q: "Is Stepclimb an AI tool?",
    a: "No. Recipes and repair rules make the changes. Nothing is sent to an AI service. What is left over is listed as squawks, each with a ready prompt you can paste into your own agent.",
  },
  {
    q: "Can I use an agent on what Stepclimb leaves behind?",
    a: "Yes. Every unresolved squawk carries a templated prompt with file paths, the failing output and a link to the upgrade guide. An MCP server so agents can call our recipes directly is planned for v1.",
  },
  {
    q: "Is Laravel Boost free?",
    a: "Boost and its upgrade command are free and official. You pay for the AI agent you run it in. It runs locally and needs an agent session per repo.",
  },
];

export default function CompareAgentsPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url: absoluteUrl(path),
    dateModified: COMPARED.iso,
    publisher: { "@type": "Organization", name: product.company, url: product.companyUrl },
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Compare" }, { label: "AI agents" }]}
        title="Stepclimb compared with AI coding agents"
        lede="Laravel Boost, GitHub Copilot agent mode and other agents can all upgrade a Laravel app. We compare how repeatable the result is, what it costs in tokens, whether it runs on a schedule and whether you can see every repo at once."
        meta={`Compared ${COMPARED.label}`}
        actions={<ButtonLink href="/sign-in" size="lg">Inspect a repo free</ButtonLink>}
      />
      <Container className="flex flex-col gap-16 py-12 md:py-20">
        <ArticleSection id="at-a-glance" title="At a glance">
          <FactTable
            caption="Stepclimb compared with Laravel Boost and general coding agents"
            columns={["", product.name, "Laravel Boost upgrade command", "General coding agents"]}
            highlight={1}
            minWidth="min-w-208"
            rows={[
              ["Same result on every run", "Recipes make the known changes the same way every time", "Non deterministic", "Non deterministic, results vary"],
              ["What it aims for", "A PR proven by composer install, your build and your tests", "Aims for a compatible app", "Whatever the prompt asks for, across the whole repo"],
              ["Tokens", "None. Nothing is sent to an AI service", "Spends your own agent's tokens", "Spends tokens, billed through the product plan"],
              ["Scheduling", "A verified weekly dependency PR per repo", "No scheduling", "A person starts each run"],
              ["Many repos", "One board shows every repo, how far behind it is and its last work order", "Needs a local agent session per repo, no PRs at scale", "A person drives each repo"],
              ["Cost", `From $9.99 per upgrade, or plans from $49 a year`, "Free. You pay for your own AI agent", "Copilot: Free, $10, $39 or $100 per user per month. Devin: Free, $20 or $200, Teams $80 plus $40 per seat"],
            ]}
          />
          <P>
            General coding agents here means GitHub Copilot agent mode, Devin and similar tools. Plans and prices were read on {COMPARED.label}. Check each vendor for today&apos;s figures.
          </P>
        </ArticleSection>

        <ArticleSection id="determinism" title="Repeatable, not creative">
          <P>
            A recipe is one named, versioned change with one commit. Run it twice on the same repo and you get the same diff. A repair rule matches a known failure and applies a known fix, then the run is verified again, up to three times. That
            is what you want for the dull, mechanical part of an upgrade. An agent can do the part that needs judgment. The two work well together.
          </P>
          <Bulletin label="Honest note">
            With no AI step, expect a few more squawks than a pass by a person plus an AI agent would leave. We list them instead of guessing, and each has a prompt you can hand to your own agent.
          </Bulletin>
        </ArticleSection>

        <ArticleSection id="agent-better" title="When an agent is the better choice">
          <UL
            items={[
              "You have one app, you are at the keyboard, and the upgrade is small. Laravel Boost is free, official and uses context from your app.",
              "You already pay for an agent such as Copilot and want flexible help on code that does not fit a recipe.",
              "The change is unusual. A person with an agent adapts as they go. A recipe only does what it was written to do.",
            ]}
          />
        </ArticleSection>

        <ArticleSection id="together" title="Using both">
          <P>
            Open the upgrade as a work order first. You get a pull request with the composer changes, the config diffs and a Verified check with test counts. Then hand the remaining squawks to your agent using the prompts in the PR. See{" "}
            <A href="/docs/squawks-and-severities">squawks and severities</A> and <A href="/docs/how-verification-works">how verification works</A>.
          </P>
        </ArticleSection>

        <ArticleSection id="sources" title="Sources and method">
          <P>
            Facts about other products come from their public pages, read on {COMPARED.label}. We have not benchmarked any agent, and we publish no speed or token figures. See also the{" "}
            <A href="/compare/laravelshift">comparison with laravelshift.com</A>.
          </P>
          <Sources
            checked={COMPARED.label}
            items={[
              { label: "Laravel 13 upgrade guide", href: "https://laravel.com/docs/13.x/upgrade" },
              { label: "GitHub Copilot plans", href: "https://github.com/features/copilot/plans" },
              { label: "Devin pricing", href: "https://devin.ai/pricing" },
            ]}
          />
        </ArticleSection>
      </Container>
      <Faq title="Common questions" items={faq} />
      <FinalCta
        title="See what a verified upgrade pull request looks like"
        body="The free inspection reads composer.json and composer.lock only. No code is cloned."
        cta={{ href: "/sign-in", label: "Inspect a repo free" }}
        note="Free inspection first. Cancel at period end. Pause up to 3 months."
      />
    </>
  );
}
