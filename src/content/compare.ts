import { planById, product } from "@/config/product";
import type { CompareValue } from "@/components/marketing/compare-table";
import { COMPARED } from "./dates";

export interface CompareEntry {
  slug: string;
  competitor: string;
  title: string;
  description: string;
  headline: string;
  intro: string;
  rows: { label: string; values: [CompareValue, CompareValue] }[];
  /** Where the competitor is the better fit. Facts from docs/brief.md only. */
  fitNote: string;
  faq: { q: string; a: string }[];
  /** Optional extras used by the full comparison page. */
  checked?: { iso: string; label: string };
  priceTable?: { head: string[]; rows: string[][] };
  sources?: { label: string; href: string }[];
  betterFit?: string[];
}

const dollars = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
const ours = (id: string, interval: "month" | "year" | "half") =>
  dollars(planById(id)?.prices.find((p) => p.interval === interval)?.usd ?? 0);

const comp = "laravelshift.com";

/** Compare-page data: add an entry and /compare/<slug> exists. Facts only, each from docs/brief.md "Pricing" and "Competitors". */
export const comparisons: CompareEntry[] = [
  {
    slug: "laravelshift",
    competitor: comp,
    title: `${product.fullName} compared with ${comp}`,
    description: `Prices and features of ${product.name} and ${comp} side by side, compared on ${COMPARED.label}, with sources linked and an honest note on legacy versions.`,
    headline: `${product.name} compared with ${comp}`,
    intro: `Both open an upgrade pull request for a Laravel app. The differences are the price, what runs before the PR opens, and where your code goes. Prices and features compared on ${COMPARED.label}.`,
    checked: COMPARED,
    rows: [
      { label: "One upgrade to Laravel 13.x", values: ["$19", dollars(999)] },
      {
        label: "Checked before the PR opens",
        values: [
          "Not verified. A Laravel Daily review found CI failed because composer update is not run",
          "composer install, your asset build and your tests run in our sandbox",
        ],
      },
      { label: "Free inspection of a repo", values: ["No free tier or scan", "Yes, unlimited reports"] },
      {
        label: "Code and AI",
        values: ["The optional AI Review add on (+$9) uses an external AI model", "Our own sandbox. Nothing is sent to an AI service"],
      },
      { label: "Agency fleet view and client reports", values: ["None", "Fleet board now, white label client reports in v1"] },
      { label: "Legacy versions", values: ["Back to Laravel 4.2", "10 to 11 onward at launch, 8.x and 9.x in v1, older in v2"] },
    ],
    priceTable: {
      head: ["Product", comp, product.name],
      rows: [
        ["Upgrade to Laravel 13.x", "$19", dollars(999)],
        ["Upgrade to Laravel 12.x", "$29", dollars(1499)],
        ["Older major, per jump", "$39", `${dollars(1999)} (11.x at launch)`],
        ["Laravel Fixer or HTML converter", "$19", dollars(999)],
        ["Tailwind converter", "$19", `${dollars(999)} (ships in v1)`],
        ["Lumen, Livewire or PSR 4 converter", "$9", dollars(499)],
        ["Extra checks", "AI Review add on, +$9", `Extended verification add on, +${dollars(499)}`],
        ["One repo, current versions", "Latest Single, $99 a year", `Solo, ${ours("solo", "year")} a year`],
        ["One repo, older versions", "Legacy Single, $149 every 6 months", `Legacy Solo, ${ours("legacy_solo", "half")} every 6 months`],
        ["Unlimited repos, current versions", "Latest Unlimited, $899 a year", `Studio, ${ours("studio", "year")} a year, 5 seats`],
        ["Unlimited repos, older versions", "Legacy Unlimited, $949 every 6 months", `Legacy Studio, ${ours("legacy_studio", "half")} every 6 months, 5 seats`],
        ["Everything", "Everything, $2,999 a year", `Agency, ${ours("agency", "month")} a month or ${ours("agency", "year")} a year`],
      ],
    },
    betterFit: [
      "Your apps are older than Laravel 8. laravelshift.com covers versions back to 4.2. Our 8.x and 9.x paths ship in v1 and older ones in v2.",
      "You want its wider catalog. laravelshift.com lists 49 or more Shifts, a Workbench of about 60 tasks, an API, webhooks and Claude Code skills. Our API and webhooks arrive in v1.",
      "You value a long track record. It has run for about ten years, and its founder reports about 90% retention (founder reported, not verified).",
    ],
    fitNote: `Upgrading from Laravel 7 or older? Today ${comp} covers more legacy versions; our 8.x and 9.x paths ship in v1 and older ones in v2.`,
    faq: [
      {
        q: `Is ${product.name} cheaper than ${comp}?`,
        a: `On the plans we compared on ${COMPARED.label}, yes, at about half the price. One upgrade to Laravel 13.x is $19 at ${comp} and ${dollars(999)} here. One repo on current versions is $99 a year there and ${ours("solo", "year")} a year here. Check their pricing page for today's figures.`,
      },
      {
        q: `Does ${comp} verify its pull requests?`,
        a: `A Laravel Daily review reported that CI failed on a Shift pull request because composer update is not run. That is a third party observation, not a current test of their product. ${product.name} runs composer install, your asset build and your tests in a sandbox before the PR opens.`,
      },
      {
        q: "Which should I use for an app on Laravel 7 or older?",
        a: `${comp} today. It covers versions back to Laravel 4.2. Our 8.x and 9.x paths ship in v1 and older ones in v2.`,
      },
      {
        q: `Does ${comp} send my code to an AI model?`,
        a: `Its optional AI Review add on, at +$9, uses an external AI model, as observed on ${COMPARED.label}. ${product.name} sends nothing to an AI service.`,
      },
      {
        q: "Are these two products related?",
        a: `No. ${product.fullName} is made by ${product.company} and is not affiliated with ${comp}, Laravel or Laravel Holdings Inc.`,
      },
    ],
    sources: [
      { label: `${comp} home page`, href: "https://laravelshift.com" },
      { label: `${comp} Shifty plans`, href: "https://laravelshift.com/shifty-plans" },
    ],
  },
];

export const comparisonBySlug = (slug: string) => comparisons.find((c) => c.slug === slug);
export const compareEntries = comparisons;
