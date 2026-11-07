import { requireFounderPage } from "@/lib/auth/session";
import Link from "next/link";
import { DataTable, Td } from "@/components/app/data-table";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/states";
import { adminRuns } from "@/lib/admin/console";
import { getDb } from "@/lib/db";
import { RUN_STATUSES } from "@/lib/runs/types";
import { workOrderNo } from "@/lib/runs/work-order";

export const metadata = { title: "Admin runs" };
export const dynamic = "force-dynamic";

const tone = (s: string) => (s === "succeeded" ? "success" : s === "failed" || s === "timed_out" ? "danger" : s === "canceled" ? "warning" : "info");

export default async function AdminRunsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireFounderPage("/admin/runs");
  const { status } = await searchParams;
  const filter = RUN_STATUSES.find((s) => s === status);
  const runs = await adminRuns(await getDb(), { ...(filter ? { status: filter } : {}), limit: 100 });
  return (
    <>
      <PageHeader title="Run inspector" description="Every run across all accounts, newest first. Open one for steps, logs, squawks and the refund tool." />
      <nav aria-label="Filter by status" className="mb-4 flex flex-wrap gap-2">
        <Link href="/admin/runs" className="inline-flex min-h-11 items-center px-2 body-6 text-action focus-visible:focus-ring" aria-current={!filter ? "page" : undefined}>All</Link>
        {RUN_STATUSES.map((s) => <Link key={s} href={`/admin/runs?status=${s}`} className="inline-flex min-h-11 items-center px-2 body-6 text-action focus-visible:focus-ring" aria-current={filter === s ? "page" : undefined}>{s.replace("_", " ")}</Link>)}
      </nav>
      {runs.length === 0 ? <p className="body-6 text-text-subtle" data-testid="admin-runs-empty">No runs match.</p> : (
        <div data-testid="admin-runs">
          <DataTable caption="Runs" columns={[{ key: "o", label: "Order" }, { key: "r", label: "Repository" }, { key: "k", label: "Kind" }, { key: "h", label: "Hop" }, { key: "b", label: "Billing" }, { key: "s", label: "Status" }, { key: "t", label: "Started" }]}>
            {runs.map((r) => (
              <tr key={r.id}>
                <Td><Link href={`/admin/runs/${r.id}`} className="mono-data text-action focus-visible:focus-ring">#{workOrderNo(r.id)}</Link></Td>
                <Td>{r.fullName}</Td>
                <Td muted>{r.kind}</Td>
                <Td muted>{r.kind === "autopilot" ? "deps" : `${r.hopFrom} to ${r.hopTo}`}</Td>
                <Td muted>{r.billing.via}{r.creditRefunded ? " (refunded)" : ""}</Td>
                <Td><Badge tone={tone(r.status)}>{r.status.replace("_", " ")}</Badge></Td>
                <Td muted>{new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " ")}</Td>
              </tr>
            ))}
          </DataTable>
        </div>
      )}
    </>
  );
}
