import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { InspectionReport } from "@/components/app/inspection-report";
import { PageHeader } from "@/components/app/page-header";
import { ScanButton } from "@/components/app/scan-button";
import { requireOrg } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import type { ScanDoc } from "@/lib/github/scan";

export const metadata = { title: "Inspection report" };

export default async function InspectionPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireOrg({ page: true });
  const { id } = await params;
  const db = await getDb();
  const scan = await db.docs.get<ScanDoc>("scans", decodeURIComponent(id));
  if (!scan || scan.accountId !== ctx.org.id) notFound();
  return (
    <>
      <Link href="/app" className="body-6 mb-4 inline-flex min-h-11 items-center gap-2 text-text-subtle hover:text-text focus-visible:focus-ring">
        <ArrowLeft size={16} weight="regular" aria-hidden />Hangar
      </Link>
      <PageHeader title={`Inspection: ${scan.report.repo}`} description={scan.report.reads} actions={<ScanButton repoId={scan.repoId} label="Scan again" />} />
      <InspectionReport report={scan.report} repoId={scan.repoId} returnTo={`/app/inspections/${encodeURIComponent(id)}`} />
    </>
  );
}
