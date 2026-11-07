"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/components/app/api";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/states";

/** One button that posts JSON to an admin endpoint and refreshes the page. Errors are shown inline. */
export function AdminActionButton({ label, endpoint, body, variant = "secondary", size = "sm" }: { label: string; endpoint: string; body: unknown; variant?: "primary" | "secondary" | "danger" | "tertiary"; size?: "sm" | "md" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setErr(null);
    const r = await api(endpoint, { body });
    setBusy(false);
    if (!r.ok) setErr(r.code.replace(/_/g, " "));
    else router.refresh();
  }
  return (
    <span className="inline-flex flex-col gap-1">
      <Button type="button" variant={variant} size={size} loading={busy} onClick={go}>{label}</Button>
      {err ? <span role="alert" className="caption-2 text-danger">{err}</span> : null}
    </span>
  );
}

export function RefundForm({ runId, canMoney }: { runId: string; canMoney: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"credit" | "money" | null>(null);
  const [msg, setMsg] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  async function go(mode: "credit" | "money") {
    setBusy(mode);
    setMsg(null);
    const r = await api<{ refundId?: string }>("/api/admin/refund", { body: { runId, mode, reason } });
    setBusy(null);
    if (r.ok) { setMsg({ tone: "success", text: mode === "credit" ? "Credit returned." : `Payment refunded (${r.data.refundId ?? "ok"}).` }); router.refresh(); }
    else setMsg({ tone: "danger", text: r.code.replace(/_/g, " ") });
  }
  return (
    <form className="flex max-w-xl flex-col gap-3" onSubmit={(e) => e.preventDefault()}>
      <Field label="Reason (kept in the audit log)" htmlFor="refund-reason">
        <Input id="refund-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" loading={busy === "credit"} disabled={reason.trim().length < 3} onClick={() => go("credit")}>Return credit</Button>
        {canMoney ? <Button type="button" variant="danger" loading={busy === "money"} disabled={reason.trim().length < 3} onClick={() => go("money")}>Refund payment</Button> : null}
      </div>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
    </form>
  );
}
