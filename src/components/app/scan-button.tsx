"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Runs the free inspection for one repo, then refreshes the server rendered page. */
export function ScanButton({ repoId, label = "Run free scan", variant = "secondary" }: { repoId: string; label?: string; variant?: "primary" | "secondary" | "tertiary" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/repos/${encodeURIComponent(repoId)}/scan`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setErr(res.status === 429 ? "Too many scans. Wait a minute." : "Scan failed. Try again.");
      return;
    }
    router.refresh();
  }
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button size="sm" variant={variant} loading={busy} onClick={go}>{label}</Button>
      {err ? <span role="alert" className="caption-5 text-danger">{err}</span> : null}
    </span>
  );
}
