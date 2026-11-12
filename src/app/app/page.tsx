import Link from "next/link";
import { Meter } from "@/components/app/meter";
import { METERS_SHOWN } from "@/components/app/labels";
import { PageHeader } from "@/components/app/page-header";
import { buttonClass } from "@/components/ui/button";
import { Badge, EmptyState, ErrorState, Notice } from "@/components/ui/states";
import { HangarBoard } from "@/components/app/hangar-board";
import { isFounderAdmin } from "@/lib/auth/session";
import { hasAppCredentials } from "@/lib/github/app-store";
import { loadHangar, type Hangar } from "@/lib/github/hangar";
import { claimInstallations } from "@/lib/github/sync";
import { requireOrg, seatsInUse } from "@/lib/auth/session";
import { effectivePlan } from "@/lib/billing/entitlement";
import { currentUsage } from "@/lib/billing/usage";
import { getDb } from "@/lib/db";

export const metadata = { title: "Hangar" };

/** What a row will look like once a repo is installed. Fictional, and labelled as such. */
function ExampleRow() {
  return (
    <figure className="w-full max-w-2xl border border-dashed border-border-strong bg-surface p-3" aria-label="Example airframe row, fictional">
      <figcaption className="label-log text-text-muted">Example, fictional repo</figcaption>
      <div className="mt-2 grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1 sm:grid-cols-[1fr_auto_auto]">
        <span className="body-5 text-text">northgate/billing-portal</span>
        <span className="mono-data caption-1 text-text">Laravel 11.45</span>
        <span className="caption-4 text-danger col-span-2 sm:col-span-1">Security fixes ended 12 Mar 2026</span>
      </div>
    </figure>
  );
}

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ installed?: string; link?: string }> }) {
  const { installed, link } = await searchParams;
  const ctx = await requireOrg({ page: true });
  const db = await getDb();
  const ent = await db.getEntitlement(ctx.org.id);
  const plan = effectivePlan(ent);
  const usage = await currentUsage(db, ctx.org.id, METERS_SHOWN, new Date(), await seatsInUse(ctx.org.id));
  const app = await hasAppCredentials(db);
  const founder = isFounderAdmin(ctx.user);
  let hangar: Hangar | null = null;
  try {
    // installs made before this org existed are linked by GitHub login
    await claimInstallations(db, ctx.org.id, { githubLogin: (ctx.user as unknown as { githubLogin?: string | null }).githubLogin ?? null });
    hangar = await loadHangar(db, ctx.org.id);
  } catch {
    hangar = null;
  }
  const installHref = app ? `https://github.com/apps/${app.slug}/installations/new` : null;
  return (
    <>
      <PageHeader
        title="Hangar"
        description={`${ctx.org.name}. Every repo as an airframe: Laravel version, how far behind, when support ends.`}
        actions={<span className="flex flex-wrap items-center gap-3">{hangar && hangar.rows.length > 0 ? <a href="/api/repos/export" download className={buttonClass("tertiary", "md")}>Export CSV</a> : null}{installHref ? <Link href={installHref} className={buttonClass("secondary", "md")}>Add repositories</Link> : null}</span>}
      />
      {installed && link === "github" ? <div className="mb-6"><Notice tone="warning" title="Sign in with GitHub to link this installation">We link an installation only when GitHub confirms you can see it. Sign in with GitHub, then open the app on GitHub and press Configure: GitHub sends you back here and we link it.</Notice></div> : null}
      {installed && link !== "github" ? <div className="mb-6"><Notice tone="success" title="GitHub App installed">Repositories sync in the background. Run a free scan on any airframe.</Notice></div> : null}
      <div className="mb-6">
        {hangar === null ? (
          <ErrorState
            title="The hangar could not load"
            body="We could not read your repositories. Nothing was changed. Reload the page, and if it keeps failing email support."
            action={<Link href="/app" className={buttonClass("secondary")}>Reload</Link>}
          />
        ) : hangar.rows.length === 0 ? (
          <EmptyState
            title="No airframes yet"
            visual={<ExampleRow />}
            body="Install the Stepclimb GitHub App on the repos you choose. Each one gets a free inspection that reads composer.json, composer.lock and package.json only, so no code is cloned."
            action={
              installHref ? <Link href={installHref} className={buttonClass("primary")}>Install the GitHub App</Link>
              : founder ? <Link href="/setup/github-app" className={buttonClass("primary")}>Set up the GitHub App</Link>
              : <Link href="/docs" className={buttonClass("primary")}>Read how inspection works</Link>
            }
          />
        ) : <HangarBoard hangar={hangar} />}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="plan-h" className="flex flex-col gap-4 border border-border bg-surface-raised p-6">
          <div className="flex items-center justify-between gap-2">
            <h2 id="plan-h" className="label-log text-text-subtle">Current plan</h2>
            {ent?.status === "past_due" ? <Badge tone="warning">Payment failed</Badge> : ent?.cancelAtPeriodEnd ? <Badge tone="warning">Ends soon</Badge> : <Badge tone="success">Active</Badge>}
          </div>
          <p className="heading-4 text-text">{plan.name}</p>
          <p className="body-6 text-text-subtle">{plan.tagline}</p>
          <Link href="/app/billing" className={buttonClass("secondary", "md", "self-start")}>
            {plan.id === "free" ? "See plans" : "Manage plan"}
          </Link>
        </section>
        <section aria-labelledby="usage-h" className="flex flex-col gap-4 border border-border bg-surface-raised p-6 lg:col-span-2">
          <h2 id="usage-h" className="label-log text-text-subtle">Usage</h2>
          <div className="flex flex-col gap-6">
            {usage.map((u) => <Meter key={u.meter} state={u} />)}
          </div>
        </section>
      </div>
    </>
  );
}
