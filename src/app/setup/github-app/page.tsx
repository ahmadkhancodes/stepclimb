import { notFound } from "next/navigation";
import Link from "next/link";
import { Button, buttonClass } from "@/components/ui/button";
import { Notice } from "@/components/ui/states";
import { product } from "@/config/product";
import { getSession, isFounderAdmin } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { env } from "@/lib/env";
import { hasAppCredentials } from "@/lib/github/app-store";
import { APP_EVENTS, APP_PERMISSIONS, buildManifest, makeState, manifestFormAction } from "@/lib/github/manifest";

export const metadata = { title: "Set up the GitHub App", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  state: "The setup link expired or was opened in another browser. Start again from this page.",
  code: "GitHub did not send a code. Start again from this page.",
  exists: "The GitHub App is already connected, so the new credentials were discarded.",
  convert: "GitHub did not accept the code (codes work once, for one hour). Start again from this page.",
};

/** Founder only (ADMIN_EMAILS). One click manifest flow: this form POSTs the manifest to GitHub. Nothing is pasted anywhere. */
export default async function SetupGithubAppPage({ searchParams }: { searchParams: Promise<{ org?: string; done?: string; error?: string }> }) {
  const s = await getSession();
  if (!s || !isFounderAdmin(s.user)) notFound();
  const sp = await searchParams;
  const db = await getDb();
  const existing = await hasAppCredentials(db);
  const manifest = buildManifest(product.url);
  const state = await makeState(env().BETTER_AUTH_SECRET ?? "dev-only-secret-dev-only-secret-0000");
  const encryptionReady = !!env().APP_ENCRYPTION_KEY;
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-10">
        <Link href="/app" className="heading-6 text-text focus-visible:focus-ring">{product.name}</Link>
      </header>
      <main id="main" className="flex flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:px-10">
        <div className="flex max-w-2xl flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="heading-5 text-text">GitHub App setup</h1>
            <p className="body-6 text-text-subtle">One click. GitHub shows a confirmation page, and the credentials come straight back to {product.name}, encrypted in the database. Nothing to copy.</p>
          </div>
          {sp.done ? <Notice tone="success" title="GitHub App connected">The credentials are stored encrypted. Install the app on a repository next.</Notice> : null}
          {sp.error ? <Notice tone="danger" title="Setup did not finish">{ERRORS[sp.error] ?? "Something went wrong. Start again from this page."}</Notice> : null}
          {!encryptionReady ? <Notice tone="warning" title="APP_ENCRYPTION_KEY is missing">Set it in the project environment first, otherwise the credentials cannot be stored.</Notice> : null}
          {existing ? (
            <div className="flex flex-col gap-3 border border-border bg-surface-raised p-6">
              <h2 className="title-2 text-text">Connected: {existing.slug}</h2>
              <p className="body-6 text-text-subtle">Setup is one time and will not overwrite stored credentials.</p>
              <div className="flex flex-wrap gap-2">
                <a href={`https://github.com/apps/${existing.slug}/installations/new`} className={buttonClass("primary")}>Install on a repository</a>
                <Link href="/app" className={buttonClass("secondary")}>Open the Hangar</Link>
              </div>
            </div>
          ) : (
            <form method="post" action={manifestFormAction(state, sp.org)} className="flex flex-col gap-4 border border-border bg-surface-raised p-6">
              <input type="hidden" name="manifest" value={JSON.stringify(manifest)} />
              <dl className="body-6 grid gap-2 sm:grid-cols-[10rem_1fr]">
                <dt className="text-text-subtle">Name</dt><dd>{manifest.name}</dd>
                <dt className="text-text-subtle">Webhook</dt><dd className="mono-data break-all">{manifest.hook_attributes.url}</dd>
                <dt className="text-text-subtle">Permissions</dt><dd>{Object.entries(APP_PERMISSIONS).map(([k, v]) => `${k.replace("_", " ")} ${v}`).join(", ")}</dd>
                <dt className="text-text-subtle">Events</dt><dd>{APP_EVENTS.join(", ")}</dd>
              </dl>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={!encryptionReady}>Create the Stepclimb GitHub App</Button>
              </div>
            </form>
          )}
          {!existing ? (
            <form method="get" className="body-6 flex flex-wrap items-end gap-2 text-text-subtle">
              <label className="flex flex-col gap-1">Owned by an organisation instead? Organisation login
                <input name="org" defaultValue={sp.org ?? ""} pattern="[A-Za-z0-9-]{1,39}" className="min-h-11 rounded-md border border-border-strong bg-surface px-3 text-text focus-visible:focus-ring" />
              </label>
              <Button type="submit" variant="secondary">Use organisation</Button>
            </form>
          ) : null}
        </div>
      </main>
    </div>
  );
}
