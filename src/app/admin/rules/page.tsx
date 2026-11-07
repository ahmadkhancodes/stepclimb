import { AdminActionButton } from "@/components/admin/actions";
import { DataTable, Td } from "@/components/app/data-table";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/states";
import { PATHS, pinRows, type PinRow } from "@/lib/admin/console";
import { getDb } from "@/lib/db";
import { getFlags } from "@/lib/flags";

export const metadata = { title: "Rules and paths" };
export const dynamic = "force-dynamic";

function PinTable({ kind, rows }: { kind: "recipes" | "rules"; rows: PinRow[] }) {
  return (
    <DataTable caption={kind === "recipes" ? "Recipes" : "Repair rules"} columns={[{ key: "k", label: "Key" }, { key: "v", label: kind === "recipes" ? "Version" : "Laravel" }, { key: "s", label: "State" }, { key: "a", label: "Action", align: "right" }]}>
      {rows.map((r) => (
        <tr key={r.key} data-testid={`pin-${kind}-${r.key}`}>
          <Td><code>{r.key}</code>{r.unverified ? <> <Badge tone="warning">unverified</Badge></> : null}</Td>
          <Td muted>{r.version}</Td>
          <Td>{r.pin?.disabled ? <Badge tone="danger">off</Badge> : r.pin?.version ? <Badge tone="info">held to {r.pin.version}</Badge> : <Badge tone="success">on</Badge>}</Td>
          <Td align="right">
            {r.pin ? <AdminActionButton label="Clear pin" endpoint="/api/admin/pins" body={{ kind, key: r.key, clear: true }} />
              : <AdminActionButton label="Switch off" endpoint="/api/admin/pins" body={{ kind, key: r.key, disabled: true }} />}
          </Td>
        </tr>
      ))}
    </DataTable>
  );
}

export default async function AdminRulesPage() {
  const db = await getDb();
  const [{ recipes, rules }, flags] = await Promise.all([pinRows(db), getFlags()]);
  return (
    <>
      <PageHeader title="Rules and paths" description="Switch an upgrade path, a recipe or a repair rule off. Takes effect on the next run; running work orders are untouched." />
      <div className="flex flex-col gap-8">
        <section aria-labelledby="paths-h" className="flex flex-col gap-3">
          <h2 id="paths-h" className="title-2 text-text">Upgrade paths</h2>
          <DataTable caption="Upgrade paths" columns={[{ key: "p", label: "Path" }, { key: "s", label: "State" }, { key: "a", label: "Action", align: "right" }]}>
            {PATHS.map((p) => {
              const off = flags[p.flag] === "off";
              return (
                <tr key={p.flag} data-testid={`path-${p.flag}`}>
                  <Td>Laravel {p.from} to {p.to}</Td>
                  <Td>{off ? <Badge tone="danger">off</Badge> : <Badge tone="success">on</Badge>}</Td>
                  <Td align="right"><AdminActionButton label={off ? "Switch on" : "Switch off"} endpoint="/api/admin/flags" body={{ flag: p.flag, on: off }} /></Td>
                </tr>
              );
            })}
          </DataTable>
        </section>
        <section aria-labelledby="recipes-h" className="flex flex-col gap-3">
          <h2 id="recipes-h" className="title-2 text-text">Recipes ({recipes.length})</h2>
          <PinTable kind="recipes" rows={recipes} />
        </section>
        <section aria-labelledby="rules-h" className="flex flex-col gap-3">
          <h2 id="rules-h" className="title-2 text-text">Repair rules ({rules.length})</h2>
          <PinTable kind="rules" rows={rules} />
        </section>
      </div>
    </>
  );
}
