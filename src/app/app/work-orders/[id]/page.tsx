import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/app/page-header";
import { RunView } from "@/components/app/run-view";
import { requireOrg } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getRun } from "@/lib/runs/store";
import { workOrderNo } from "@/lib/runs/work-order";

export const metadata = { title: "Work order" };
export const dynamic = "force-dynamic";

export default async function WorkOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrg({ page: true });
  const { id } = await params;
  const run = await getRun(await getDb(), decodeURIComponent(id));
  if (!run || run.accountId !== ctx.org.id) notFound();
  return (
    <>
      <Link href="/app/work-orders" className="body-6 mb-4 inline-flex min-h-11 items-center gap-2 text-text-subtle hover:text-text focus-visible:focus-ring">
        <ArrowLeft size={16} weight="regular" aria-hidden />Work orders
      </Link>
      <PageHeader title={`Work order #${workOrderNo(run.id)}`} description={`${run.fullName} · Laravel ${run.hopFrom} to ${run.hopTo}`} />
      <RunView runId={run.id} />
    </>
  );
}
