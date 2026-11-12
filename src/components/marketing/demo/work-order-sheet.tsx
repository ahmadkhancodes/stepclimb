import { Check, Eye, Warning } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/components/ui/cn";
import { ReturnStamp } from "./stamp";
import { sampleTasks, type TaskState } from "./data";

const chip: Record<TaskState, { label: string; cls: string }> = {
  done: { label: "Done", cls: "text-success" },
  must: { label: "Must fix", cls: "text-danger" },
  review: { label: "Review", cls: "text-info" },
};

function StateChip({ state }: { state: TaskState }) {
  const c = chip[state];
  return (
    <span className={cn("caption-3 inline-flex items-center gap-1 rounded-sm border border-current px-2 py-0.5", c.cls)}>
      {state === "done" ? <Check size={12} weight="regular" aria-hidden /> : null}
      {state === "must" ? <Warning size={12} weight="regular" aria-hidden /> : null}
      {state === "review" ? <Eye size={12} weight="regular" aria-hidden /> : null}
      {c.label}
    </span>
  );
}

const headCell = "px-4 py-3";
const dt = "caption-3 uppercase tracking-wider text-text-subtle";
const dd = "body-4 mt-1 break-words";

/** The hero object: a work order sheet. Cropped to header + 4 tasks + stamp below 640px. */
export function WorkOrderSheet({ className, id }: { className?: string; id?: string }) {
  return (
    <article
      id={id}
      aria-label="Example work order"
      className={cn(
        "relative border border-border bg-surface-raised shadow-[0_1px_0_rgba(20,25,28,0.06),0_8px_24px_-12px_rgba(20,25,28,0.18)]",
        className,
      )}
    >
      <span className="stamp-text absolute -top-3 left-6 bg-surface-inverse px-2 text-text-inverse">Example, fictional repo</span>
      <dl className="grid grid-cols-2 border-b border-border sm:grid-cols-[1fr_1.7fr_1.2fr_1.2fr]">
        <div className={headCell}><dt className={dt}>Work order</dt><dd className={cn(dd, "mono-data")}>No. 4821</dd></div>
        <div className={cn(headCell, "border-l border-border")}><dt className={dt}>Airframe</dt><dd className={dd}>northgate/billing-portal</dd></div>
        <div className={cn(headCell, "border-t border-border sm:border-l sm:border-t-0")}><dt className={dt}>Hop</dt><dd className={cn(dd, "mono-data")}>11.45 → 13.x</dd></div>
        <div className={cn(headCell, "border-l border-t border-border sm:border-t-0")}><dt className={dt}>Opened</dt><dd className={cn(dd, "mono-data")}>05 Nov 2026</dd></div>
      </dl>
      <div className="flex items-baseline justify-between gap-4 px-4 pb-2 pt-4">
        <h2 className="heading-6 text-text">Upgrade to Laravel 13</h2>
        <span className="caption-4 text-right text-text-subtle">9 recipes · 11 min 42 s</span>
      </div>
      <ol>
        {sampleTasks.map((t, i) => (
          <li
            key={t.n}
            className={cn(
              "grid grid-cols-[24px_1fr] items-start gap-x-2 gap-y-1 border-t border-border px-4 py-2 sm:grid-cols-[32px_1fr_auto]",
              i === 4 && "hidden sm:grid",
            )}
          >
            <span className="mono-data body-6 text-text-subtle">{t.n}</span>
            <span className="body-6 text-text">
              {t.title}
              <span className="mono-data caption-5 mt-0.5 block text-text-subtle">{t.files}</span>
            </span>
            <span className="col-start-2 justify-self-start sm:col-start-auto sm:justify-self-end"><StateChip state={t.state} /></span>
          </li>
        ))}
      </ol>
      <div className="flex flex-col items-start justify-between gap-4 border-t border-border bg-surface p-4 sm:flex-row sm:items-center">
        <ul className="grid gap-1">
          {["composer install", "npm run build"].map((c) => (
            <li key={c} className="body-6 flex items-center gap-2"><Check size={16} weight="regular" aria-hidden className="text-success" />{c}</li>
          ))}
          <li className="body-6 flex items-center gap-2"><Check size={16} weight="regular" aria-hidden className="text-success" /><span className="mono-data">214 tests passed</span></li>
        </ul>
        <ReturnStamp className="self-center" />
      </div>
    </article>
  );
}
