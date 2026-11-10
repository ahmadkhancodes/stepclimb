/**
 * THE single source of product identity, plans, limits, flags and copy constants.
 * Stepclimb by BufferSol. Prices are the brief's (docs/brief.md "Pricing"), in USD cents.
 */

export type PlanId = "free" | "solo" | "legacy_solo" | "studio" | "legacy_studio" | "agency";
/** "half" = every 6 months (Stripe: interval month, interval_count 6). */
export type Interval = "month" | "year" | "half";
export type MeterId = "repos" | "seats" | "extended_verify" | "public_prs";

/** Sentinels for "no practical limit". Over 200 repos or SSO is an Enterprise quote (brief). */
export const MAX_REPOS = 200;
export const MAX_SEATS = 1000;

export interface PlanPrice {
  interval: Interval;
  /** USD cents. Real prices only (playbook section 2). */
  usd: number;
  /** Stripe lookup key, always `${product.slug}_${plan}_${monthly|annual|semiannual}` (app isolation). */
  lookupKey: string;
}

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Empty for the free plan. */
  prices: PlanPrice[];
  limits: Record<MeterId, number>;
  /** Short plain-text differences shown in the pricing table. */
  highlights: string[];
  cta: string;
  featured?: boolean;
  /** Days of trial. 0 = none: the free inspection plus one public repo PR a month is the trial. */
  trialDays: number;
  /** Priced per repository (Stripe quantity = repos). */
  perRepo?: boolean;
  /** Legacy plans cover every supported hop from older majors. */
  legacy?: boolean;
}

const slug = "stepclimb";
const price = (plan: PlanId, interval: Interval, usd: number): PlanPrice => ({
  interval,
  usd,
  lookupKey: `${slug}_${plan}_${interval === "month" ? "monthly" : interval === "year" ? "annual" : "semiannual"}`,
});

export const product = {
  slug,
  name: "Stepclimb",
  fullName: "Stepclimb by BufferSol",
  company: "BufferSol Technologies",
  companyUrl: "https://buffersoltech.com",
  host: "stepclimb.buffersoltech.com",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "https://stepclimb.buffersoltech.com",
  supportEmail: "contact@buffersoltech.com",
  legalEmail: "contact@buffersoltech.com",
  mailFrom: "Stepclimb by BufferSol <no-reply@stepclimb.buffersoltech.com>",
  description:
    "Verified Laravel upgrade pull requests. One commit per change, composer install and your tests run in our own sandbox before the PR opens. From $9.99 per upgrade.",
  tagline: "Laravel upgrade PRs that prove they work",
  /** Legal entity details used by the legal templates. */
  legal: {
    entity: "BufferSol Technologies LLC",
    jurisdiction: "the State of New York, United States",
    address: "447 W Broadway, 2nd Floor Suite #1964, New York, NY 10013, United States",
    effectiveDate: "2026-11-05",
  },
  /** Honest first release list (docs/DECISIONS.md D-07). */
  subProcessors: [
    { name: "Vercel Inc.", purpose: "Hosting, edge network and the sandboxes that run upgrades", location: "United States" },
    { name: "MongoDB Inc. (Atlas)", purpose: "Database hosting", location: "United States (AWS us-east-1)" },
    { name: "Cloudflare Inc.", purpose: "DNS, scheduled jobs and file storage", location: "United States" },
    { name: "Stripe Inc.", purpose: "Payments and invoicing", location: "United States" },
    { name: "Email delivery provider", purpose: "Transactional email until our own mail servers are live", location: "United States" },
  ],
  currency: "usd" as const,
  /** Default billing interval shown first in the pricing toggle. */
  defaultInterval: "year" as Interval,
  plans: [
    {
      id: "free",
      name: "Free inspection",
      tagline: "See how far behind each repo is",
      prices: [],
      limits: { repos: 0, seats: 1, extended_verify: 0, public_prs: 1 },
      highlights: ["Unlimited inspection reports", "1 upgrade PR a month on public open source repos", "Reads composer.json, composer.lock and package.json only"],
      cta: "Inspect a repo free",
      trialDays: 0,
    },
    {
      id: "solo",
      name: "Solo",
      tagline: "One repo on current versions",
      prices: [price("solo", "year", 4900)],
      limits: { repos: 1, seats: 1, extended_verify: 0, public_prs: 1 },
      highlights: ["$49 per repo per year", "Current major upgrades", "Weekly dependency PR, verified", "Fixer and side tasks"],
      cta: "Subscribe",
      trialDays: 0,
      perRepo: true,
    },
    {
      id: "legacy_solo",
      name: "Legacy Solo",
      tagline: "One repo on older versions",
      prices: [price("legacy_solo", "half", 7400)],
      limits: { repos: 1, seats: 1, extended_verify: 0, public_prs: 1 },
      highlights: ["$74 per repo every 6 months", "Every supported hop from older majors", "Everything in Solo"],
      cta: "Subscribe",
      trialDays: 0,
      perRepo: true,
      legacy: true,
    },
    {
      id: "studio",
      name: "Studio",
      tagline: "Unlimited repos on current versions",
      prices: [price("studio", "year", 44900)],
      limits: { repos: MAX_REPOS, seats: 5, extended_verify: 0, public_prs: 1 },
      highlights: ["Unlimited repos on current versions", "5 seats", "Fleet dashboard", "API and webhooks (v1)"],
      cta: "Choose Studio",
      trialDays: 0,
    },
    {
      id: "legacy_studio",
      name: "Legacy Studio",
      tagline: "Unlimited repos on older versions",
      prices: [price("legacy_studio", "half", 47400)],
      limits: { repos: MAX_REPOS, seats: 5, extended_verify: 0, public_prs: 1 },
      highlights: ["Unlimited repos, all supported versions", "5 seats", "Fleet dashboard"],
      cta: "Choose Legacy Studio",
      trialDays: 0,
      legacy: true,
    },
    {
      id: "agency",
      name: "Agency",
      tagline: "Everything, capped at $99 a month",
      prices: [price("agency", "month", 9900), price("agency", "year", 99900)],
      limits: { repos: MAX_REPOS, seats: MAX_SEATS, extended_verify: 1_000_000, public_prs: 1 },
      highlights: ["All upgrade paths and side tasks", "Unlimited seats", "White label client reports (v1)", "Priority queue", "Extended verification on every run"],
      cta: "Choose Agency",
      featured: true,
      trialDays: 0,
    },
  ] satisfies Plan[],
  /** Grace period after a failed payment (past_due keeps the plan, C-20) before limits fall to Free. */
  graceDays: 7,
  /** Remote flag defaults (overridden by APP_FLAGS env JSON and the Mongo `config` collection). */
  flags: {
    payments_enabled: "on",
    signups_enabled: "on",
    maintenance: "off",
  } as Record<string, string>,
  nav: [
    { href: "/pricing", label: "Pricing" },
    { href: "/guides", label: "Guides" },
    { href: "/security", label: "Security" },
    { href: "/docs", label: "Docs" },
  ],
} as const;

export type Product = typeof product;
export const plans: readonly Plan[] = product.plans;
export const planById = (id: string): Plan | undefined => plans.find((p) => p.id === id);
export const freePlan = plans.find((p) => p.prices.length === 0) ?? plans[0]!;
export const allLookupKeys = (): string[] => plans.flatMap((p) => p.prices.map((x) => x.lookupKey));
export const planForLookupKey = (key: string | null | undefined): { plan: Plan; price: PlanPrice } | null => {
  if (!key) return null;
  for (const plan of plans) for (const p of plan.prices) if (p.lookupKey === key) return { plan, price: p };
  return null;
};

/** One time upgrade packs (brief "Pricing"). Sold through Stripe one time prices; each run consumes a credit. */
export type CreditKind = "to_latest" | "to_previous" | "older_hop" | "side_task" | "small_converter" | "extended_verify";
export interface OneOff { kind: CreditKind; name: string; usd: number; lookupKey: string; note: string }
export const oneOffs: readonly OneOff[] = [
  { kind: "to_latest", name: "Upgrade to Laravel 13.x", usd: 999, lookupKey: `${slug}_credit_to_latest`, note: "One verified PR, repair pass included, 14 days of re runs on the same branch" },
  { kind: "to_previous", name: "Upgrade to Laravel 12.x", usd: 1499, lookupKey: `${slug}_credit_to_previous`, note: "One verified PR, repair pass included, 14 days of re runs on the same branch" },
  { kind: "older_hop", name: "Older jump, per major", usd: 1999, lookupKey: `${slug}_credit_older_hop`, note: "11.x at launch; 9.x and 10.x in v1" },
  { kind: "side_task", name: "Fixer, Tailwind or HTML converter", usd: 999, lookupKey: `${slug}_credit_side_task`, note: "One verified side task PR" },
  { kind: "small_converter", name: "Small converter (Lumen, Livewire, PSR 4)", usd: 499, lookupKey: `${slug}_credit_small_converter`, note: "One run" },
  { kind: "extended_verify", name: "Extended verification add on", usd: 499, lookupKey: `${slug}_credit_extended_verify`, note: "PHP 8.3, 8.4 and 8.5 matrix, 60 minute limit, 5 repair loops" },
];
