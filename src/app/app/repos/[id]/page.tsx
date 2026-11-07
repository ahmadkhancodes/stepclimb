import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { AutopilotSettings } from "@/components/app/autopilot-settings";
import { PageHeader } from "@/components/app/page-header";
import { requireOrg } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import type { RepoDoc } from "@/lib/github/sync";
import { isSubscriber } from "@/lib/runs/service";

export const metadata = { title: "Repository settings" };
export const dynamic = "force-dynamic";

export default async function RepoSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrg({ page: true });
  const db = await getDb();
  const repo = await db.docs.get<RepoDoc>("repos", decodeURIComponent((await params).id));
  if (!repo || repo.accountId !== ctx.org.id) notFound();
  return (
    <>
      <Link href="/app" className="body-6 mb-4 inline-flex min-h-11 items-center gap-2 text-text-subtle hover:text-text focus-visible:focus-ring">
        <ArrowLeft size={16} weight="regular" aria-hidden />Hangar
      </Link>
      <PageHeader title={repo.fullName} description="Autopilot keeps dependencies current with one verified pull request a week." />
      <AutopilotSettings repoId={repo.id} subscriber={isSubscriber(await db.getEntitlement(ctx.org.id))} />
    </>
  );
}
