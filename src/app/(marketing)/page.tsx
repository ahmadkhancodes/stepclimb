import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { product } from "@/config/product";
import { ButtonLink } from "@/components/ui/button";
import { Container, Section } from "@/components/ui/layout";
import {
  CompareTable,
  Faq,
  FinalCta,
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

function Tile({ title, children, fragment, className }: { title: string; children: ReactNode; fragment: ReactNode; className?: string }) {
  return (
    <div className={`flex flex-col gap-6 border border-border bg-surface-raised p-6 ${className ?? ""}`}>
      <div>
        <h3 className="heading-6 text-text">{title}</h3>
        <p className="body-4 mt-2 max-w-xl text-text-subtle">{children}</p>
      </div>
      <div className="mt-auto">{fragment}</div>
    </div>
  );
}

function Step({ n, title, fragment, children }: { n: number; title: string; fragment: ReactNode; children: ReactNode }) {
  return (
    <li className="flex flex-col gap-6 border-t border-border-strong pt-6">
      <div>
        <p className="mono-data caption-3 text-text-subtle">Step {n}</p>
        <h3 className="heading-5 mt-2 text-text">{title}</h3>
        <p className="body-4 mt-2 text-text-subtle">{children}</p>
      </div>
      <div className="mt-auto">{fragment}</div>
    </li>
  );
}

export default function Home() {
  return (
    <main id="main">
      {/* 2. Hero */}
      <section aria-labelledby="hero-title" className="bg-surface pb-12 pt-32 md:pb-24 md:pt-40">
        <Container>
          <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
            <div className="lg:col-span-5">
              <h1 id="hero-title" className="heading-3 md:heading-1 text-text">
                Laravel upgrade PRs <span className="block">that prove they work</span>
              </h1>
              <p className="body-2 mt-6 max-w-xl text-text-subtle">
                Stepclimb by BufferSol upgrades your Laravel app as a pull request: one commit per change, composer install and your tests run in our own sandbox, and a repair pass driven by rules for common breakage. Your code never leaves our servers. From $9.99 per upgrade.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                <ButtonLink href={CTA} size="lg">Inspect a repo free</ButtonLink>
                <a href="#sample" className="button-md inline-flex min-h-11 items-center text-action underline underline-offset-4 hover:text-action-hover focus-visible:focus-ring">See a sample work order</a>
              </div>
              <p className="caption-2 mt-4 max-w-md text-text-subtle">{RISK}</p>
              <p className="caption-3 mt-8 max-w-md border-t border-border pt-4 text-text-subtle">
                Laravel 11 security fixes ended 12 Mar 2026. Laravel 12 security fixes end 24 Feb 2027. Dates from the Laravel release notes, checked 3 Nov 2026.
              </p>
            </div>
            <div className="lg:col-span-7">
              <WorkOrderSheet id="sample" className="scroll-mt-24" />
            </div>
          </div>
        </Container>
      </section>

      {/* 3. Problem */}
      <Section tone="raised" labelledBy="problem-title">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <h2 id="problem-title" className="heading-4 md:heading-2 text-text">Every Laravel major ends the clock on the one before it</h2>
            <p className="body-3 mt-6 text-text-subtle">
              Laravel ships a breaking major each year, around Q1. Each gets 18 months of bug fixes and 2 years of security fixes. So an app left alone for two releases is out of support, and the longer the gap, the bigger the diff. Teams put it off until the client asks about a security questionnaire, a host drops old PHP, or composer audit finds a CVE.
            </p>
          </div>
          <div className="lg:col-span-7"><SupportRunway /></div>
        </div>
      </Section>

      {/* 4. Benefits bento */}
      <Section labelledBy="benefits-title">
        <h2 id="benefits-title" className="heading-4 md:heading-2 max-w-3xl text-text">What you get in every pull request</h2>
        <div className="mt-12 grid gap-4 lg:grid-cols-6">
          <Tile className="lg:col-span-4" title="Verified, not just opened" fragment={<VerifiedFragment />}>
            composer install, npm run build and your tests run in a fresh sandbox before the PR opens. The result is a check on the PR: Verified, with each stage listed.
          </Tile>
          <Tile className="lg:col-span-2 lg:row-span-2" title="One change per commit" fragment={<CommitList />}>
            Each recipe is one atomic commit with a name and a version, so you can review, revert or cherry pick.
          </Tile>
          <Tile className="lg:col-span-4" title="Inspect before you pay" fragment={<InspectionReport />}>
            A free report from composer.json and composer.lock: versions behind, support end date, recipes that apply, effort band S to XL.
          </Tile>
          <Tile className="lg:col-span-3" title="Your code stays on our servers" fragment={<CustodyLines />}>
            Runs happen in an isolated sandbox that is destroyed after the run. We keep no customer code. Nothing is sent to an AI service.
          </Tile>
          <Tile className="lg:col-span-3" title="Stay current weekly" fragment={<AutopilotPr />}>
            One grouped dependency pull request a week per repo, verified, that refreshes instead of piling up.
          </Tile>
        </div>
      </Section>

      {/* 5. Tagline */}
      <TaglineReveal text="Every upgrade is a work order. Every change is a logbook entry. Nothing returns to service until it is signed off." />

      {/* 6. How it works */}
      <Section tone="raised" labelledBy="how-title">
        <h2 id="how-title" className="heading-4 md:heading-2 max-w-3xl text-text">How it works</h2>
        <ol className="mt-12 grid gap-10 lg:grid-cols-3 lg:gap-8">
          <Step n={1} title="Inspect" fragment={<InspectionReport />}>
            Install the GitHub App on the repos you choose. Each repo gets an inspection: Laravel version, PHP constraint, stack, what applies and what it would take.
          </Step>
          <Step n={2} title="Open a work order" fragment={<RunTimeline />}>
            Pick the hop, for example 11 to 13. We run the recipes in a sandbox, apply the repair rules if something breaks, and re-verify up to three times.
          </Step>
          <Step n={3} title="Return to service" fragment={<PrCheck />}>
            You get a pull request with a work order in the body, squawks on the exact lines that need a person, and the Verified check. Merging stays with you. We never auto merge.
          </Step>
        </ol>
      </Section>

      {/* 7. Rules, not guesses */}
      <Section labelledBy="rules-title">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-5">
            <p className="caption-3 uppercase tracking-wider text-text-subtle">Rules, not guesses</p>
            <h2 id="rules-title" className="heading-4 md:heading-2 mt-4 text-text">Recipes make the known changes the same way every time</h2>
            <p className="body-3 mt-6 text-text-subtle">
              Recipes and repair rules make the known changes the same way every time. Nothing is sent to an AI service. What is left is listed for you, with a ready prompt for your own agent if you use one.
            </p>
            <p className="body-4 mt-4 text-text">Expect a few more squawks than a human plus AI pass would leave. We list them instead of guessing.</p>
          </div>
          <div className="lg:col-span-7"><SquawkDrawer /></div>
        </div>
      </Section>

      {/* 8. For agencies */}
      <Section tone="raised" labelledBy="agencies-title">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <div className="lg:col-span-4">
            <h2 id="agencies-title" className="heading-4 md:heading-2 text-text">Fifty client apps, one board</h2>
            <p className="body-3 mt-6 text-text-subtle">
              The hangar board shows every repo, how far behind it is, when support ends and the last work order. Studio and Agency plans add seats and white label client reports.
            </p>
            <p className="caption-3 mt-4 text-text-subtle">Board shown with sample data.</p>
          </div>
          <div className="lg:col-span-8"><HangarBoard /></div>
        </div>
      </Section>

      {/* 9. Compare */}
      <Section labelledBy="compare-title">
        <h2 id="compare-title" className="heading-4 md:heading-2 max-w-3xl text-text">Against laravelshift.com and doing it with an AI agent</h2>
        <p className="caption-2 mb-8 mt-4 text-text-subtle">
          Prices and features compared on 3 Nov 2026. Sources are listed on the <Link href="/compare/laravelshift" className="text-action underline underline-offset-4 hover:text-action-hover focus-visible:focus-ring">full comparison</Link>.
        </p>
        <CompareTable caption="Stepclimb compared with laravelshift.com and an AI agent" rowHeader="Compared on" columns={["Stepclimb", "laravelshift.com", "AI agent"]} rows={compareRows} highlightColumn={0} />
        <p className="body-4 mt-6 max-w-2xl text-text-subtle">
          Upgrading from Laravel 7 or older? Today laravelshift.com covers more legacy versions; our 8.x and 9.x paths ship in v1 and older ones in v2.
        </p>
      </Section>

      {/* 10. Pricing */}
      <PricingTable
        title="Pricing"
        intro="Same core jobs, about half the price of laravelshift.com on every comparable plan, with verification included and no third party AI touching your code. Prices compared on 3 Nov 2026; sources linked."
      />

      {/* 11. Security */}
      <Section tone="raised" labelledBy="security-title">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
          <h2 id="security-title" className="heading-4 md:heading-2 text-text lg:col-span-5">Where your code goes, in four lines</h2>
          <div className="lg:col-span-7">
            <ol className="border-t border-border-strong">
              {[
                "Each run gets its own sandbox with no host mounts. It is destroyed when the run ends.",
                "The sandbox can reach package registries and GitHub, nothing else. Blocked hosts are logged.",
                "Installation tokens are scoped to one repo and expire within an hour. The sandbox never holds them.",
                "We do not retain customer code. Logs are kept 30 days with secrets redacted.",
              ].map((line, i) => (
                <li key={line} className="grid grid-cols-[2rem_1fr] gap-4 border-b border-border py-4">
                  <span className="mono-data caption-3 pt-1 text-text-subtle">{i + 1}</span>
                  <span className="body-3 text-text">{line}</span>
                </li>
              ))}
            </ol>
            <p className="body-4 mt-6 text-text-subtle">
              Payment, hosting and database providers are listed in full on the{" "}
              <Link href="/legal/subprocessors" className="text-action underline underline-offset-4 hover:text-action-hover focus-visible:focus-ring">sub processor list</Link>. Read more on the{" "}
              <Link href="/security" className="text-action underline underline-offset-4 hover:text-action-hover focus-visible:focus-ring">security page</Link>.
            </p>
          </div>
        </div>
      </Section>

      {/* 13. FAQ */}
      <Faq items={faqs} />

      {/* 14. Final CTA */}
      <FinalCta
        title="Find out how far behind your repos are"
        cta={{ href: CTA, label: "Inspect a repo free" }}
        note={RISK}
      />
    </main>
  );
}
