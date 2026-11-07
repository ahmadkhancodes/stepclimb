import Link from "next/link";
import { DataTable, Td } from "@/components/app/data-table";
import { PageHeader } from "@/components/app/page-header";
import { fmt } from "@/components/app/labels";
import { Badge } from "@/components/ui/states";
import { adminOverview } from "@/lib/admin";
import { usageOverview } from "@/lib/admin/console";
import { getDb } from "@/lib/db";
import { getFlags } from "@/lib/flags";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const db = await getDb();
  const [totals, flags, usage] = await Promise.all([adminOverview(), getFlags(), usageOverview(db)]);
  const stats = [
    { label: "Users", value: fmt(totals.users) },
    { label: "Organizations", value: fmt(totals.orgs) },
    { label: "Paid organizations", value: fmt(totals.paidOrgs) },
    { label: "Runs, last 30 days", value: fmt(usage.runs.last30d) },
    { label: "Verified rate", value: usage.verifiedRate === null ? "n/a" : `${Math.round(usage.verifiedRate * 100)}%` },
    { label: "Autopilot repos", value: fmt(usage.autopilotRepos) },
  ];
  return (
    <>
      <PageHeader title="Admin overview" description="Usage across every organization. Visible to founder accounts only." />
      <div className="flex flex-col gap-8">
        <dl className="grid gap-4 sm:grid-cols-3" data-testid="admin-stats">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-6">
              <dt className="title-4 text-text-subtle">{s.label}</dt>
              <dd className="heading-4 tabular-nums text-text">{s.value}</dd>
            </div>
          ))}
        </dl>

        <section aria-labelledby="alerts-h" className="flex flex-col gap-3">
          <h2 id="alerts-h" className="title-2 text-text">Alerts</h2>
          {usage.openAlerts.length === 0 ? <p className="body-6 text-text-subtle">No open alerts: no stuck runs, failed webhooks or stale cron heartbeat.</p> : (
            <ul className="flex flex-col gap-2">{usage.openAlerts.map((a) => <li key={a.key}><Badge tone="danger">{a.title}</Badge></li>)}</ul>
          )}
          <p className="caption-2 text-text-subtle">Last backup: {usage.lastBackup ? `${usage.lastBackup.createdAt.slice(0, 16).replace("T", " ")} UTC${usage.lastBackup.stored ? "" : " (manifest only, no object store yet)"}` : "none yet"}.</p>
        </section>

        <section aria-labelledby="runs-h" className="flex flex-col gap-3">
          <h2 id="runs-h" className="title-2 text-text">Runs by status</h2>
          <DataTable caption="Runs by status" columns={[{ key: "s", label: "Status" }, { key: "n", label: "Runs", align: "right" }]}>
            {Object.entries(usage.runs.byStatus).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => (
              <tr key={k}><Td>{k.replace("_", " ")}</Td><Td align="right">{fmt(v)}</Td></tr>
            ))}
          </DataTable>
          <p className="caption-2 text-text-subtle">
            {fmt(usage.runs.total)} runs from {fmt(usage.accounts)} accounts, {fmt(Math.round(usage.runs.computeSeconds / 60))} compute minutes. Billing: {Object.entries(usage.runs.byBilling).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}. <Link href="/admin/runs" className="text-action focus-visible:focus-ring">Open the run inspector</Link>.
          </p>
        </section>

        <section aria-labelledby="credits-h" className="flex flex-col gap-3">
          <h2 id="credits-h" className="title-2 text-text">Credits outstanding</h2>
          <p className="body-6 text-text-subtle">{Object.keys(usage.creditsOutstanding).length ? Object.entries(usage.creditsOutstanding).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join(" · ") : "None."}</p>
        </section>

        <section aria-labelledby="flags-h" className="flex flex-col gap-3">
          <h2 id="flags-h" className="title-2 text-text">Feature flags</h2>
          <DataTable caption="Feature flags" columns={[{ key: "flag", label: "Flag" }, { key: "value", label: "Value" }]}>
            {Object.entries(flags).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => (
              <tr key={k}>
                <Td><code>{k}</code></Td>
                <Td><Badge tone={v === "on" || v === "true" ? "success" : "info"}>{v}</Badge></Td>
              </tr>
            ))}
          </DataTable>
          <p className="caption-2 text-text-subtle">Flags come from product defaults, the config collection and the APP_FLAGS environment variable, in that order. Upgrade path switches live under Rules and paths.</p>
        </section>
      </div>
    </>
  );
}
