"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "@phosphor-icons/react/dist/ssr";
import { product, plans, oneOffs, type Interval, type Plan, type PlanPrice } from "@/config/product";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

const money = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: product.currency.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

/** The price for the chosen interval; a plan sold only one way shows that one. */
function priceFor(plan: Plan, interval: Interval): PlanPrice | null {
  if (plan.prices.length === 0) return null;
  return plan.prices.find((p) => p.interval === interval) ?? plan.prices[0] ?? null;
}

const intervalWord: Record<Interval, string> = { month: "per month", year: "per year", half: "per 6 months" };
const unitFor = (plan: Plan, price: PlanPrice) => (plan.perRepo ? `per repo ${intervalWord[price.interval].replace("per ", "")}` : intervalWord[price.interval]);

/** Dollars saved per year by paying annually, for each plan sold both ways. Computed from config. */
function annualSaving(): { plan: Plan; monthly: number; yearly: number; saved: number } | null {
  for (const plan of [...plans].reverse()) {
    const m = plan.prices.find((x) => x.interval === "month");
    const y = plan.prices.find((x) => x.interval === "year");
    if (m && y) return { plan, monthly: m.usd * 12, yearly: y.usd, saved: m.usd * 12 - y.usd };
  }
  return null;
}

const rowGrid = "grid gap-x-6 gap-y-4 px-4 py-6 md:grid-cols-12 md:items-start md:px-6";
const colHead = "caption-3 uppercase tracking-wider text-text-subtle";

function PlanRow({ plan, interval }: { plan: Plan; interval: Interval }) {
  const price = priceFor(plan, interval);
  const free = !price;
  const href = free ? "/sign-in?plan=free" : `/sign-in?plan=${plan.id}&interval=${price.interval}`;
  const monthlyEq = price && price.interval === "year" && plan.prices.some((p) => p.interval === "month") ? price.usd / 12 : null;
  const includes = plan.highlights.filter((h) => !h.startsWith("$"));
  const featured = !!plan.featured;
  return (
    <li className={cn("relative bg-surface-raised", featured ? "border-2 border-action" : "border-t border-border first:border-t-0")}>
      {featured ? <span className="stamp-text absolute -top-3 left-6 bg-action px-2 text-action-text">Best for agencies</span> : null}
      <div className={rowGrid}>
        <div className="md:col-span-3">
          <h3 className="heading-6 text-text">{plan.name}</h3>
          <p className="body-6 mt-1 text-text-subtle">{plan.tagline}</p>
        </div>
        <div className="md:col-span-3">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="mono-data heading-4 text-text">{free ? "$0" : money(price.usd)}</span>
            <span className="body-6 text-text-subtle">{free ? "always" : unitFor(plan, price)}</span>
          </p>
          {monthlyEq ? <p className="mono-data caption-5 mt-1 text-text-subtle">about {money(Math.round(monthlyEq))} a month</p> : null}
        </div>
        <ul className="grid gap-1 md:col-span-4">
          {includes.map((h) => (
            <li key={h} className="body-6 flex items-start gap-2 text-text">
              <Check size={16} weight="regular" aria-hidden className="mt-0.5 shrink-0 text-success" />
              <span>{h}</span>
            </li>
          ))}
        </ul>
        <div className="md:col-span-2 md:justify-self-end">
          <Link href={href} className={cn(buttonClass(featured || free ? "primary" : "secondary", "md"), "w-full md:w-auto")}>
            {plan.cta}
          </Link>
        </div>
      </div>
    </li>
  );
}

export function PricingTable({ id = "pricing", title, intro }: { id?: string; title?: string; intro?: string }) {
  const [interval, setBilling] = useState<Interval>(product.defaultInterval);
  const saving = annualSaving();
  const options: { id: Interval; label: string }[] = [
    { id: "month", label: "Monthly" },
    { id: "year", label: "Annual" },
  ];
  const free = plans.filter((p) => p.prices.length === 0);
  const paid = plans.filter((p) => p.prices.length > 0);

  return (
    <div id={id}>
      <div className="grid gap-6 md:grid-cols-12 md:items-end md:gap-x-6">
        <div className="md:col-span-7">
          {title ? <h2 id={`${id}-title`} className="heading-4 md:heading-2 text-text">{title}</h2> : null}
          {intro ? <p className="body-3 mt-4 max-w-xl text-text-subtle">{intro}</p> : null}
        </div>
        {saving ? (
          <div className="flex flex-col gap-2 md:col-span-5 md:items-end">
            <div role="group" aria-label="Billing interval" className="inline-flex w-fit border border-border bg-surface-raised p-1">
              {options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  aria-pressed={interval === o.id}
                  onClick={() => setBilling(o.id)}
                  className={cn(
                    "button-sm min-h-11 rounded-sm px-4 transition-colors duration-300 ease-out-kit focus-visible:focus-ring",
                    interval === o.id ? "bg-action text-action-text" : "text-text-subtle hover:text-text",
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="mono-data caption-4 text-text-subtle md:text-right">
              {saving.plan.name} annual: {money(saving.yearly)} instead of {money(saving.monthly)}. You save {money(saving.saved)} a year.
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-10 border border-border bg-surface md:mt-12">
        <div aria-hidden="true" className={cn(colHead, "hidden border-b border-border bg-surface px-6 py-2 md:grid md:grid-cols-12 md:gap-x-6")}>
          <span className="col-span-3">Plan</span>
          <span className="col-span-3">Price in USD</span>
          <span className="col-span-4">Includes</span>
          <span className="col-span-2" />
        </div>
        <ul>
          {free.map((p) => <PlanRow key={p.id} plan={p} interval={interval} />)}
        </ul>
        <p className={cn(colHead, "border-y border-border bg-surface px-4 py-2 md:px-6")}>Subscriptions, billed in USD</p>
        <ul className="grid gap-0">
          {paid.map((p) => <PlanRow key={p.id} plan={p} interval={interval} />)}
        </ul>
        <p className={cn(colHead, "border-y border-border bg-surface px-4 py-2 md:px-6")}>One time upgrades</p>
        <ul className="bg-surface-raised">
          {oneOffs.map((o) => (
            <li key={o.kind} className="grid gap-x-6 gap-y-1 border-b border-border px-4 py-3 last:border-b-0 md:grid-cols-12 md:items-baseline md:px-6">
              <span className="body-5 text-text md:col-span-3">{o.name}</span>
              <span className="mono-data body-4 text-text md:col-span-3">{money(o.usd)} <span className="body-6 font-normal text-text-subtle">per run</span></span>
              <span className="body-6 text-text-subtle md:col-span-4">{o.note}</span>
              <span className="md:col-span-2 md:justify-self-end">
                <Link
                  href={`/sign-in?credit=${o.kind}`}
                  className="button-sm inline-flex min-h-11 items-center gap-1 rounded-sm text-action transition-colors duration-300 ease-out-kit hover:text-action-hover focus-visible:focus-ring"
                >
                  Open upgrade PR<ArrowRight size={16} weight="regular" aria-hidden />
                </Link>
              </span>
            </li>
          ))}
        </ul>
        <div className="grid gap-x-6 gap-y-3 border-t border-border bg-surface px-4 py-6 md:grid-cols-12 md:items-center md:px-6">
          <div className="md:col-span-6">
            <h3 className="heading-6 text-text">Enterprise</h3>
            <p className="body-6 mt-1 text-text-subtle">Over 200 repos, or you need SSO. We quote it.</p>
          </div>
          <div className="md:col-span-6 md:justify-self-end">
            <a href={`mailto:${product.supportEmail}?subject=Stepclimb%20Enterprise%20quote`} className={cn(buttonClass("secondary", "md"), "w-full md:w-auto")}>Talk to us</a>
          </div>
        </div>
      </div>
      <p className="body-6 mt-4 text-text-subtle">Free inspection first. Cancel at period end. Pause up to 3 months.</p>
    </div>
  );
}
