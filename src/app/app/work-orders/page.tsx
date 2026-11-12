import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { Stamp } from "@/components/marketing/demo/stamp";
import { EmptyState } from "@/components/ui/states";
import { buttonClass } from "@/components/ui/button";
import { requireOrg } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { listRuns } from "@/lib/runs/store";
import { workOrderNo } from "@/lib/runs/work-order";

export const metadata = { title: "Work orders" };
export const dynamic = "force-dynamic";

const th = "label-log whitespace-nowrap border-b border-border-strong bg-surface-sunken px-3 py-2 text-left text-text-subtle";
const td = "h-10 whitespace-nowrap border-b border-border px-3";

export default async function WorkOrdersPage() {
  const ctx = await requireOrg({ page: true });
  const runs = await listRuns(await getDb(), ctx.org.id);
  return (
    <>
      <PageHeader title="Work orders" description="Every upgrade run: what was changed, how it was verified, and the PR." />
      {runs.length === 0 ? (
        <EmptyState
          title="No work orders yet"
          body={<>Open an inspection in the Hangar and start the first hop. A work order runs in a fresh sandbox and ends in a pull request you review.</>}
          visual={
            <figure aria-label="Example work order row, fictional" className="w-full max-w-2xl border border-dashed border-border-strong bg-surface p-3">
              <figcaption className="label-log text-text-muted">Example, fictional repo</figcaption>
              <div className="mono-data caption-1 mt-2 flex flex-wrap gap-x-4 gap-y-1 text-text">
                <span>No. 4821</span><span>northgate/billing-portal</span><span>11 to 13</span><span className="text-success">Verified</span>
              </div>
            </figure>
          }
          action={<Link href="/app" className={buttonClass("primary")}>Go to the Hangar</Link>}
        />
      ) : (
        <div className="overflow-x-auto border border-border bg-surface-raised" data-testid="work-orders">
          <table className="w-full border-collapse">
            <thead><tr><th scope="col" className={th}>Order</th><th scope="col" className={th}>Repository</th><th scope="col" className={th}>Hop</th><th scope="col" className={th}>Status</th><th scope="col" className={th}>Started</th></tr></thead>
            <tbody>
              {runs.map((r) => {
                const tone = r.status === "succeeded" ? (r.checkConclusion === "success" ? "ok" : r.checkConclusion === "failure" ? "failed" : "unverified") : r.status === "failed" ? "failed" : r.status === "timed_out" ? "unverified" : "idle";
                const label = r.status === "succeeded" ? (r.checkConclusion === "success" ? "Verified" : r.checkConclusion === "failure" ? "Failed" : "Unverified") : r.status.replace("_", " ");
                return (
                  <tr key={r.id}>
                    <td className={td}><Link href={`/app/work-orders/${r.id}`} className="mono-data text-action focus-visible:focus-ring">#{workOrderNo(r.id)}</Link></td>
                    <td className={`${td} body-4`}>{r.fullName}</td>
                    <td className={`${td} body-6`}>{r.kind === "autopilot" ? "Dependency update" : `Laravel ${r.hopFrom} to ${r.hopTo}`}</td>
                    <td className={td}><Stamp tone={tone}>{label[0]!.toUpperCase() + label.slice(1)}</Stamp></td>
                    <td className={`${td} body-6 text-text-subtle`}>{new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " ")} UTC</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
