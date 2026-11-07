"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { oneOffs } from "@/config/product";
import { Button } from "@/components/ui/button";
import type { CreditKind } from "@/lib/runs/types";

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

const MESSAGES: Record<string, string> = {
  run_already_open: "A work order for this hop is already open.",
  too_many_runs: "Two work orders are already running. Wait for one to finish.",
  runner_unavailable: "Runs are not switched on yet. Your inspection stays free.",
  rate_limited: "Too many requests. Wait a minute.",
  forbidden: "Your role cannot start work orders.",
};

/** Starts a work order for one hop. A 402 turns into the pay per run step: one time Checkout for the existing one off price. */
export function StartRunButton({ repoId, appPath, hopFrom, hopTo, returnTo }: { repoId: string; appPath: string; hopFrom: number; hopTo: number; returnTo: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pay, setPay] = useState<CreditKind | null>(null);
  const key = useRef<string | null>(null);

  async function start() {
    key.current ??= `${repoId}:${appPath}:${hopFrom}:${Date.now()}`; // one key per attempt: a double click cannot start two runs
    setBusy(true);
    setErr(null);
    const res = await fetch("/api/runs", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key.current }, body: JSON.stringify({ repoId, appPath, hopFrom }) });
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string; creditKind?: CreditKind };
    if (res.ok && body.id) {
      router.push(`/app/work-orders/${body.id}`);
      return;
    }
    setBusy(false);
    if (res.status === 402 && body.creditKind) setPay(body.creditKind);
    else setErr(MESSAGES[body.error ?? ""] ?? "Could not start the work order. Try again.");
  }
  async function checkout() {
    if (!pay) return;
    setBusy(true);
    const res = await fetch("/api/billing/credit-checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: pay, returnTo }) });
    const body = (await res.json().catch(() => ({}))) as { url?: string };
    if (res.ok && body.url) {
      window.location.href = body.url;
      return;
    }
    setBusy(false);
    setErr(res.status === 403 ? "Only an owner can buy a work order." : "Checkout is not available right now.");
  }

  const offer = pay ? oneOffs.find((o) => o.kind === pay) : null;
  return (
    <div className="flex flex-col items-start gap-2" data-testid="start-run">
      {offer ? (
        <div role="status" className="flex flex-col gap-2 border border-border bg-surface-raised p-4">
          <p className="title-4 text-text">One verified PR for {usd(offer.usd)}</p>
          <p className="body-6 text-text-subtle">{offer.name}. {offer.note}. You pay once; nothing renews.</p>
          <div className="flex gap-2">
            <Button size="sm" loading={busy} onClick={checkout}>Pay {usd(offer.usd)} and continue</Button>
            <Button size="sm" variant="tertiary" onClick={() => setPay(null)}>Not now</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" loading={busy} onClick={start}>Start work order: Laravel {hopFrom} to {hopTo}</Button>
      )}
      {err ? <span role="alert" className="caption-5 text-danger">{err}</span> : null}
    </div>
  );
}
