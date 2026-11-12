"use client";
import { ArrowSquareOut, X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Stamp } from "@/components/marketing/demo/stamp";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/states";
import type { RunDoc, RunLogDoc, RunStepDoc, SquawkDoc } from "@/lib/runs/types";

type Safe = Omit<RunDoc, "eventSecret" | "idempotencyKey"> & { id: string };
interface Payload { run: Safe; steps: (RunStepDoc & { id: string })[]; squawks: (SquawkDoc & { id: string })[]; logs: (RunLogDoc & { id: string })[] }

const TERMINAL = ["succeeded", "failed", "timed_out", "canceled"];
const STATUS_TEXT: Record<string, string> = { queued: "Queued", starting: "Starting the sandbox", running: "Running", finalizing: "Opening the PR", succeeded: "Delivered", failed: "Failed", timed_out: "Timed out", canceled: "Canceled" };
const SEV: Record<string, string> = { must_fix: "Must fix", review: "Review", note: "Note" };
const STEP_TONE: Record<string, string> = { passed: "text-success", failed: "text-danger", running: "text-text", skipped: "text-text-subtle", pending: "text-text-subtle", blocked_host: "text-warning" };

/** Log panel: monospace, new lines appended, stays pinned to the bottom unless the reader scrolled up. */
export function LogPanel({ logs, live }: { logs: { id: string; stream: string; text: string }[]; live: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [logs.length]);
  return (
    <section aria-label="Run log" className="border border-border bg-surface-sunken">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="label-log text-text-subtle">Log</h2>
        {live ? <span className="caption-5 text-text-subtle" aria-live="polite">Live</span> : null}
      </div>
      <div
        ref={ref}
        role="log"
        tabIndex={0}
        aria-label="Log output"
        onScroll={(e) => { const t = e.currentTarget; pinned.current = t.scrollHeight - t.scrollTop - t.clientHeight < 24; }}
        className="mono-data max-h-96 min-h-40 overflow-auto whitespace-pre-wrap break-words p-3 text-sm focus-visible:focus-ring"
      >
        {logs.length === 0 ? <p className="text-text-subtle">{live ? "Waiting for the runner to start. Output appears here as it happens." : "No log output was recorded."}</p> : logs.map((l) => (
          <div key={l.id} className={l.stream === "stderr" ? "text-danger" : l.stream === "system" ? "text-text-subtle" : "text-text"}>{l.text}</div>
        ))}
      </div>
    </section>
  );
}

function RunSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading work order" className="flex flex-col gap-4">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function RunView({ runId }: { runId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [logs, setLogs] = useState<Payload["logs"]>([]);
  const [failed, setFailed] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const after = useRef(0);
  const done = useRef(false);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}?after=${after.current}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const p = (await res.json()) as Payload;
      if (p.logs.length) {
        after.current = p.logs[p.logs.length - 1]!.seq;
        setLogs((cur) => [...cur, ...p.logs]);
      }
      setData(p);
      setFailed(false);
      done.current = TERMINAL.includes(p.run.status);
    } catch {
      setFailed(true);
    }
  }, [runId]);

  useEffect(() => {
    void poll();
    const t = setInterval(() => { if (!done.current) void poll(); }, 2000);
    return () => clearInterval(t);
  }, [poll]);

  async function cancel() {
    setCanceling(true);
    await fetch(`/api/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST" });
    setCanceling(false);
    await poll();
    router.refresh();
  }

  if (failed && !data) {
    return <ErrorState title="Could not load this work order" body="The page could not reach the server. Your run is not affected." action={<Button onClick={() => void poll()}>Try again</Button>} />;
  }
  if (!data) return <RunSkeleton />;
  const { run, steps, squawks } = data;
  const live = !TERMINAL.includes(run.status);
  const tone = run.status === "succeeded" ? (run.checkConclusion === "success" ? "ok" : run.checkConclusion === "failure" ? "failed" : "unverified") : run.status === "failed" ? "failed" : run.status === "timed_out" ? "unverified" : "idle";
  const verdict = run.status === "succeeded" ? (run.checkConclusion === "success" ? "Verified" : run.checkConclusion === "failure" ? "Failed" : "Unverified") : STATUS_TEXT[run.status] ?? run.status;

  return (
    <div className="flex flex-col gap-6" data-testid="run-view" data-status={run.status}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Stamp tone={tone}>{verdict}</Stamp>
          <p className="body-5 text-text-subtle" role="status">{STATUS_TEXT[run.status] ?? run.status}</p>
        </div>
        <div className="flex items-center gap-2">
          {run.prUrl ? <a href={run.prUrl} className="button-sm inline-flex min-h-11 items-center gap-1 text-link focus-visible:focus-ring" target="_blank" rel="noreferrer">Open PR #{run.prNumber}<ArrowSquareOut size={16} weight="regular" aria-hidden /></a> : null}
          {live ? <Button size="sm" variant="secondary" loading={canceling} onClick={cancel}><X size={16} weight="regular" aria-hidden />Cancel run</Button> : null}
        </div>
      </div>
      {failed ? <p role="alert" className="caption-5 text-warning">Connection lost. Retrying.</p> : null}
      {run.error && run.status !== "succeeded" ? <ErrorState title={run.status === "timed_out" ? "The run hit its time limit" : run.status === "canceled" ? "The run was canceled" : "The run did not finish"} body={<>Reason: <code>{run.error}</code>. {run.billing.via === "credit" && !run.branch ? "Your credit was returned." : null}</>} /> : null}

      <section aria-label="Steps" className="border border-border bg-surface p-4">
        <h2 className="title-3 text-text">Steps</h2>
        {steps.length === 0 ? <p className="body-6 mt-2 text-text-subtle">No steps yet.</p> : (
          <ol className="mt-3 flex flex-col">
            {steps.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
                <span className="mono-data body-6">{s.name}</span>
                <span className={`label-log ${STEP_TONE[s.status] ?? "text-text"}`}>{s.status.replace("_", " ")}{s.durationMs ? ` · ${(s.durationMs / 1000).toFixed(1)}s` : ""}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <LogPanel logs={logs} live={live} />

      <section aria-label="Squawks" className="border border-border bg-surface p-4">
        <h2 className="title-3 text-text">Squawks ({squawks.length})</h2>
        {squawks.length === 0 ? <p className="body-6 mt-2 text-text-subtle">{live ? "Squawks appear when the run finishes." : "None. Nothing needs your attention."}</p> : (
          <ul className="mt-3 flex flex-col gap-3">
            {squawks.map((s) => (
              <li key={s.id} className="border border-border bg-surface-raised p-3">
                <p className="body-5"><span className="label-log mr-2 text-text-subtle">{SEV[s.severity]}</span>{s.title}{s.file ? <span className="mono-data caption-5 ml-2 text-text-subtle">{s.file}{s.line ? `:${s.line}` : ""}</span> : null}</p>
                <details className="mt-2">
                  <summary className="body-6 cursor-pointer text-link focus-visible:focus-ring">Details and agent prompt</summary>
                  <p className="body-6 mt-2 whitespace-pre-wrap text-text-subtle">{s.bodyMd}</p>
                  <pre className="mono-data mt-2 overflow-auto whitespace-pre-wrap bg-surface-sunken p-3 text-sm">{s.agentPrompt}</pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
