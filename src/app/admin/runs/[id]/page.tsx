import { requireFounderPage } from "@/lib/auth/session";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { RefundForm } from "@/components/admin/actions";
import { Badge, Notice } from "@/components/ui/states";
import { adminRunDetail } from "@/lib/admin/console";
import { getDb } from "@/lib/db";
import { isTerminal } from "@/lib/runs/types";
import { workOrderNo } from "@/lib/runs/work-order";

export const metadata = { title: "Admin run" };
export const dynamic = "force-dynamic";

export default async function AdminRunPage({ params }: { params: Promise<{ id: string }> }) {
  await requireFounderPage("/admin/runs");
  const { id } = await params;
  const d = await adminRunDetail(await getDb(), id);
  if (!d) notFound();
  const { run, steps, logs, squawks, credit } = d;
  const refundable = isTerminal(run.status) && run.billing.via === "credit" && !!run.billing.creditId && !run.creditRefunded;
  const rows: [string, string][] = [
    ["Repository", run.fullName], ["Account", run.accountId], ["Kind", run.kind], ["Hop", run.kind === "autopilot" ? "dependency update" : `Laravel ${run.hopFrom} to ${run.hopTo}`],
    ["Billing", `${run.billing.via}${run.billing.creditKind ? ` (${run.billing.creditKind})` : ""}${run.creditRefunded ? ", refunded" : ""}`],
    ["Branch", run.branch ?? "none"], ["PR", run.prUrl ?? "none"], ["Check", run.checkConclusion ?? "none"], ["Repair passes", `${run.repairPasses} (${run.repairRulesApplied.join(", ") || "no rules"})`],
    ["Compute", `${run.computeSeconds}s`], ["Sandbox", run.sandboxId ?? "none"], ["Error", run.error ?? "none"], ...(run.chainStopped ? [["Catch up stopped", run.chainStopped] as [string, string]] : []),
  ];
  return (
    <>
      <PageHeader title={`Work order #${workOrderNo(run.id)}`} description={<><Link href="/admin/runs" className="text-action focus-visible:focus-ring">All runs</Link> · {run.id}</>} actions={<Badge tone={run.status === "succeeded" ? "success" : run.status === "failed" || run.status === "timed_out" ? "danger" : "info"}>{run.status.replace("_", " ")}</Badge>} />
      <div className="flex flex-col gap-8" data-testid="admin-run" data-status={run.status}>
        <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
          {rows.map(([k, v]) => <div key={k} className="flex flex-col"><dt className="caption-3 text-text-subtle">{k}</dt><dd className="body-6 break-all text-text">{v}</dd></div>)}
        </dl>
        <section aria-labelledby="steps-h" className="flex flex-col gap-2">
          <h2 id="steps-h" className="title-2 text-text">Steps</h2>
          {steps.length === 0 ? <p className="body-6 text-text-subtle">No steps recorded.</p> : <ol className="flex flex-col gap-1">{steps.map((s) => <li key={s.id} className="body-6"><span className="mono-data">{s.name}</span> · {s.status}{s.durationMs !== null ? ` · ${s.durationMs} ms` : ""}</li>)}</ol>}
        </section>
        <section aria-labelledby="squawks-h" className="flex flex-col gap-2">
          <h2 id="squawks-h" className="title-2 text-text">Squawks ({squawks.length})</h2>
          <ul className="flex flex-col gap-1">{squawks.map((s) => <li key={s.id} className="body-6"><Badge tone={s.severity === "must_fix" ? "danger" : s.severity === "review" ? "warning" : "info"}>{s.severity.replace("_", " ")}</Badge> {s.title}{s.file ? ` (${s.file}${s.line ? `:${s.line}` : ""})` : ""}</li>)}</ul>
        </section>
        <section aria-labelledby="log-h" className="flex flex-col gap-2">
          <h2 id="log-h" className="title-2 text-text">Log (last {logs.length} chunks, secrets already redacted)</h2>
          <pre role="log" aria-label="Run log" className="max-h-96 overflow-auto rounded-lg border border-border bg-surface-raised p-4 mono-data whitespace-pre-wrap">{logs.map((l) => l.text).join("\n") || "No log output."}</pre>
        </section>
        <section aria-labelledby="refund-h" className="flex flex-col gap-3">
          <h2 id="refund-h" className="title-2 text-text">Refund</h2>
          {refundable ? <RefundForm runId={run.id} canMoney={!!credit?.stripeSessionId} /> : <Notice>{run.creditRefunded ? "This run was already refunded." : run.billing.via !== "credit" ? `Nothing to refund: this run was covered by ${run.billing.via === "free" ? "the free tier" : "the plan"}.` : "A refund is possible once the run has finished."}</Notice>}
        </section>
      </div>
    </>
  );
}
