import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { cadenceCopy, product } from "@/config/product";
import { CheckBox } from "@/components/ui/check-box";
import { cn } from "@/components/ui/cn";
import { Container, Section } from "@/components/ui/layout";
import {
  CompareTable,
  Faq,
  FinalCta,
  SessionButtonLink,
  PricingTable,
  TaglineReveal,
  type CompareRow,
  type FaqItem,
} from "@/components/marketing";
import {
  AutopilotPr,
  CommitList,
  CustodyLines,
  HangarBoard,
  InspectionReport,
  PrCheck,
  RunTimeline,
  SquawkDrawer,
  SupportRunway,
  VerifiedFragment,
  WorkOrderSheet,
} from "@/components/marketing/demo";

export const metadata: Metadata = {
  title: { absolute: `${product.fullName}: ${product.tagline}` },
  description: product.description,
  alternates: { canonical: "/" },
};

const CTA = "/sign-in";
const RISK = "The free inspection reads composer.json, composer.lock and package.json only. No code is cloned.";

const compareRows: CompareRow[] = [
  { label: "Price per upgrade to the latest release", values: ["$9.99", "$19", "Your own agent usage"] },
  { label: "Verification before you see the PR", values: ["composer install, build and tests run in our sandbox", "PR not verified, no composer update or tests", "Not deterministic, you check each repo"] },
  { label: "Free inspection", values: [true, false, false] },
  { label: "Where code is processed", values: ["Isolated sandbox, destroyed after the run, nothing sent to an AI service", "AI add on uses an external model", "Your machine or your agent provider"] },
  { label: "Agency fleet view", values: [true, false, false] },
  { label: "Legacy coverage", values: ["10 to 13 at launch, 8 and 9 in v1, older in v2", "Back to Laravel 4.2", "Varies by run"] },
];

const faqs: FaqItem[] = [
  { q: "Will a new tool break my client apps?", a: "We never auto merge. Every pull request carries a Verified check, or an amber Unverified stamp when your repo has no tests, and you decide what merges. Recipes are tested against fixture apps before they ship." },
  { q: "What does Verified actually mean?", a: "composer install, your asset build and your test suite ran in our sandbox and passed. The check lists each stage (composer, build, tests) and whether it passed." },
  { q: "What if my repo has no tests?", a: "We still open the pull request, and it carries an amber Unverified stamp. Composer install and your build still run, and the stamp says plainly that no tests were available." },
  { q: "Do you clone my private code?", a: "Yes, into an ephemeral sandbox that is destroyed when the run ends. We do not retain customer code. The sandbox can reach package registries and GitHub, nothing else, and blocked hosts are logged." },
  { q: "Does any AI touch my code?", a: "No. Recipes and repair rules make the changes, and nothing is sent to an AI service. The prompts we attach to squawks are templates for your own agent, if you use one." },
  { q: "I do not have org admin on GitHub. What now?", a: "Installing the GitHub App on an organisation needs an owner to approve it. We give you a request approval email you can send them, scoped to the repos you choose." },
  { q: "laravelshift.com already works for us.", a: "It may well. The differences are verification before you see the pull request, a free inspection, no external AI model, a fleet view for agencies and about half the price on comparable plans, compared on 3 Nov 2026. Upgrading from Laravel 7 or older? Today laravelshift.com covers more legacy versions; our 8.x and 9.x paths ship in v1 and older ones in v2." },
  { q: "Our AI agent can do this.", a: "It can try. Recipes give the same result every time, use no tokens, run on a schedule and show every repo on one board. Your agent can also read our prompts, so the two work together." },
  { q: "Which Laravel versions are covered?", a: "10 to 11, 11 to 12 and 12 to 13 at launch. Laravel 8 and 9 paths ship in v1, and older versions in v2." },
  { q: "How does billing and cancelling work?", a: "Payments run through Stripe, and invoices carry your VAT or GST ID. You can cancel at period end or pause for up to 3 months." },
];

/** One checklist entry: boxed number in the margin, text, then the real product fragment. Hairline between entries, no card. */
function Entry({ n, title, fragment, children }: { n: number; title: string; fragment: ReactNode; children: ReactNode }) {
  return (
    <li className="grid gap-6 border-t border-border py-10 first:border-t-0 lg:grid-cols-12 lg:gap-8">
      <p className="lg:col-span-1"><span className="mono-data caption-3 inline-block border border-text px-2 py-1 text-text">{String(n).padStart(2, "0")}</span></p>
      <div className="lg:col-span-4">
        <h3 className="heading-5 text-text">{title}</h3>
        <p className="body-6 mt-3 max-w-md text-text-subtle">{children}</p>
      </div>
      <div className="lg:col-span-7">{fragment}</div>
    </li>
  );
}

/** Procedure step in a column: vertical rule between columns on desktop, hairline on phones. */
function Step({ n, title, fragment, children }: { n: number; title: string; fragment: ReactNode; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-6 border-t border-border pt-6 lg:border-l lg:border-t-0 lg:px-8 lg:pt-0 lg:first:border-l-0 lg:first:pl-0 lg:last:pr-0">
      <div>
        <p className="label-log text-text-subtle">Step <span className="mono-data">{n}</span></p>
        <h3 className="heading-4 mt-2 text-text">{title}</h3>
        <p className="body-6 mt-3 text-text-subtle">{children}</p>
      </div>
      <div className="mt-auto">{fragment}</div>
    </li>
  );
}

/** Section head: a 2px navy drawing line with the section tab hanging from it, then the heading. */
function Head({ id, label, children, className }: { id: string; label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="rule-double"><span className="label-log inline-block bg-surface-inverse px-2 py-1 text-text-inverse">{label}</span></p>
      <h2 id={id} className="heading-4 md:heading-2 mt-6 max-w-3xl text-text">{children}</h2>
    </div>
  );
}

const link = "text-link underline underline-offset-4 hover:text-link-hover focus-visible:focus-ring";

export default function Home() {
  return (
    <>
      {/* Hero: a framed drawing sheet. Checklist left, the work order on drafting film right, title block below. */}
      <section aria-labelledby="hero-title" className="bg-surface pb-16 pt-8 md:pb-24 md:pt-12">
        <Container>
          <div className="border-2 border-text bg-surface-raised">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b-2 border-text px-4 py-2 md:px-6">
              <p className="label-log text-text">Verified upgrades for Laravel 10, 11 and 12</p>
              <p className="mono-data caption-4 text-text-subtle">10 → 11 · 11 → 12 · 12 → 13</p>
            </div>
            <div className="grid lg:grid-cols-12">
              <div className="px-4 py-8 md:px-10 md:py-12 lg:col-span-6">
                <h1 id="hero-title" className="heading-2 sm:heading-1 xl:display-1 uppercase text-text">
                  Laravel upgrade PRs that prove they work
                </h1>
                <ul className="mt-8 grid max-w-xl gap-3">
                  {[
                    "One commit per change.",
                    "composer install, your build and your tests run in our sandbox before the pull request opens.",
                    "No AI service touches your code.",
                  ].map((line) => (
                    <li key={line} className="body-3 flex items-start gap-3 text-text">
                      <CheckBox className="mt-1" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3">
                  <SessionButtonLink href={CTA} label="Inspect a repo free" size="lg" />
                  <a href="#sample" className="button-md inline-flex min-h-11 items-center text-link underline underline-offset-4 hover:text-link-hover focus-visible:focus-ring">See an example work order</a>
                </div>
                <p className="caption-2 mt-4 max-w-md text-text-muted">{RISK}</p>
              </div>
              <div className="bg-drafting border-t-2 border-text px-4 py-10 md:px-10 lg:col-span-6 lg:border-l-2 lg:border-t-0 lg:px-8 lg:py-12">
                <WorkOrderSheet id="sample" className="scroll-mt-24" />
              </div>
            </div>
            <dl className="grid grid-cols-2 border-t-2 border-text md:grid-cols-4">
              {[
                ["Price", <>From <span className="mono-data">$9.99</span> per upgrade</>],
                ["Inspection", "Free, no code cloned"],
                ["AI on your code", "None"],
                ["Merge", "Always yours, never auto"],
              ].map(([k, v], i) => (
                <div key={String(k)} className={cn("px-4 py-3 md:px-6", i % 2 === 1 && "border-l border-border", i >= 2 && "border-t border-border md:border-t-0", i === 2 && "md:border-l")}>
                  <dt className="label-log text-text-subtle">{k}</dt>
                  <dd className="body-5 mt-1 text-text">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </Container>
      </section>

      {/* Problem: the support runway ledger, full width */}
      <Section tone="raised" labelledBy="problem-title">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <Head id="problem-title" label="Why now" className="lg:col-span-5">Every Laravel major ends the clock on the one before it</Head>
          <div className="lg:col-span-7 lg:pt-16">
            <p className="body-3 max-w-2xl text-text-subtle">
              Laravel ships a breaking major each year, around Q1. Each gets 18 months of bug fixes and 2 years of security fixes. An app left alone for two releases is out of support, and the longer the gap, the bigger the diff. Teams put it off until a client sends a security questionnaire, a host drops old PHP, or composer audit finds a CVE.
            </p>
            <div className="mt-10"><SupportRunway /></div>
          </div>
        </div>
      </Section>

      {/* What is in every PR: a numbered checklist, not cards */}
      <Section labelledBy="benefits-title" rhythm="open">
        <Head id="benefits-title" label="In every pull request">Five things you can check before you merge</Head>
        <ol className="mt-12">
          <Entry n={1} title="Verified, not just opened" fragment={<VerifiedFragment />}>
            composer install, npm run build and your tests run in a fresh sandbox before the PR opens. The result is a check on the PR: Verified, with each stage listed.
          </Entry>
          <Entry n={2} title="One change per commit" fragment={<CommitList />}>
            Each recipe is one atomic commit with a name and a version, so you can review, revert or cherry pick.
          </Entry>
          <Entry n={3} title="Inspect before you pay" fragment={<InspectionReport />}>
            A free report from composer.json and composer.lock: versions behind, support end date, recipes that apply, effort band S to XL.
          </Entry>
          <Entry n={4} title="Your code stays on our servers" fragment={<CustodyLines />}>
            Runs happen in an isolated sandbox that is destroyed after the run. We keep no customer code. Nothing is sent to an AI service.
          </Entry>
          <Entry n={5} title="Stay current weekly" fragment={<AutopilotPr />}>
            {cadenceCopy.autopilot}
          </Entry>
        </ol>
      </Section>

      {/* Tagline */}
      <TaglineReveal text="Every upgrade is a work order. Every change is a checklist item. Nothing returns to service until it is signed off." />

      {/* How it works: three procedure columns with vertical rules */}
      <Section tone="raised" labelledBy="how-title">
        <Head id="how-title" label="Procedure">How it works</Head>
        <ol className="mt-12 grid gap-10 lg:grid-cols-3 lg:gap-0">
          <Step n={1} title="Inspect" fragment={<InspectionReport />}>
            Install the GitHub App on the repos you choose. Each repo gets an inspection: Laravel version, PHP constraint, stack, what applies and what it would take.
          </Step>
          <Step n={2} title="Open a work order" fragment={<RunTimeline />}>
            Pick the next hop, for example 11 to 12. We run the recipes in a sandbox, apply the repair rules if something breaks, and re-verify up to three times.
          </Step>
          <Step n={3} title="Return to service" fragment={<PrCheck />}>
            You get a pull request with a work order in the body, squawks on the exact lines that need a person, and the Verified check. Merging stays with you. We never auto merge.
          </Step>
        </ol>
      </Section>

      {/* Rules, not guesses */}
      <Section labelledBy="rules-title">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <Head id="rules-title" label="Rules, not guesses">Recipes make the known changes the same way every time</Head>
            <p className="body-3 mt-6 text-text-subtle">
              Nothing is sent to an AI service. What is left is listed for you, with a ready prompt for your own agent if you use one.
            </p>
            <p className="body-5 mt-4 text-text">Expect a few more squawks than a human plus AI pass would leave. We list them instead of guessing.</p>
          </div>
          <div className="lg:col-span-7 lg:pt-16"><SquawkDrawer /></div>
        </div>
      </Section>

      {/* For agencies: the board gets the full width */}
      <Section tone="raised" labelledBy="agencies-title" rhythm="open">
        <div className="grid gap-6 lg:grid-cols-12 lg:items-end lg:gap-12">
          <Head id="agencies-title" label="For agencies" className="lg:col-span-6">Fifty client apps, one board</Head>
          <p className="body-3 text-text-subtle lg:col-span-6">
            The hangar board shows every repo, how far behind it is, when support ends and the last work order. Studio and Agency plans add seats and white label client reports.
          </p>
        </div>
        <div className="mt-12"><HangarBoard /></div>
        <p className="caption-2 mt-4 text-text-muted">Example board with fictional repos.</p>
      </Section>

      {/* Compare */}
      <Section labelledBy="compare-title">
        <Head id="compare-title" label="Compared on 3 Nov 2026">Against laravelshift.com and doing it with an AI agent</Head>
        <p className="caption-2 mb-8 mt-4 text-text-subtle">
          Sources are listed on the <Link href="/compare/laravelshift" className={link}>full comparison</Link>.
        </p>
        <CompareTable caption="Stepclimb compared with laravelshift.com and an AI agent" rowHeader="Compared on" columns={["Stepclimb", "laravelshift.com", "AI agent"]} rows={compareRows} highlightColumn={0} />
        <p className="body-6 mt-6 max-w-2xl text-text-subtle">
          Upgrading from Laravel 7 or older? Today laravelshift.com covers more legacy versions; our 8.x and 9.x paths ship in v1 and older ones in v2.
        </p>
      </Section>

      {/* Pricing */}
      <Section labelledBy="pricing-title">
        <PricingTable
          title="Pricing"
          intro="Same core jobs, about half the price of laravelshift.com on every comparable plan, with verification included and no third party AI touching your code. Prices compared on 3 Nov 2026; sources linked."
        />
      </Section>

      {/* Security */}
      <Section tone="raised" labelledBy="security-title">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <Head id="security-title" label="Custody" className="lg:col-span-5">Where your code goes, in four lines</Head>
          <div className="lg:col-span-7 lg:pt-16">
            <ol className="border-t border-text">
              {[
                "Each run gets its own sandbox with no host mounts. It is destroyed when the run ends.",
                "The sandbox can reach package registries and GitHub, nothing else. Blocked hosts are logged.",
                "Installation tokens are scoped to one repo and expire within an hour. The sandbox never holds them.",
                "We do not retain customer code. Logs are kept 30 days with secrets redacted.",
              ].map((line, i) => (
                <li key={line} className="grid grid-cols-[2rem_1fr] gap-4 border-b border-border py-4">
                  <span className="mono-data caption-1 text-link">{String(i + 1).padStart(2, "0")}</span>
                  <span className="body-3 text-text">{line}</span>
                </li>
              ))}
            </ol>
            <p className="body-6 mt-6 text-text-subtle">
              Payment, hosting and database providers are listed in full on the <Link href="/legal/subprocessors" className={link}>sub processor list</Link>. Read more on the <Link href="/security" className={link}>security page</Link>.
            </p>
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <Faq items={faqs} />

      {/* Final CTA */}
      <FinalCta
        title="Find out how far behind your repos are"
        cta={{ href: CTA, label: "Inspect a repo free" }}
        note={RISK}
      />
    </>
  );
}
