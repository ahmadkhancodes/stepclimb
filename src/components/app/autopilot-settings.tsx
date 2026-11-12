"use client";
import { useEffect, useState } from "react";
import { api } from "@/components/app/api";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { Notice, Skeleton } from "@/components/ui/states";

interface View { weekly: boolean; timezone: string; quietMode: boolean; openPr: number | null; closedStreak: number; quietSuggested: boolean }
const ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Toronto", "Europe/London", "Europe/Berlin", "Asia/Karachi", "Asia/Kolkata", "Australia/Sydney", "UTC"];

export function AutopilotSettings({ repoId, subscriber }: { repoId: string; subscriber: boolean }) {
  const url = `/api/repos/${encodeURIComponent(repoId)}/autopilot`;
  const [v, setV] = useState<View | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<View>(url).then((r) => (r.ok ? setV(r.data) : setErr(r.message))); }, [url]);
  async function save(patch: Partial<Pick<View, "weekly" | "timezone" | "quietMode">>) {
    setBusy(true);
    setErr(null);
    const r = await api<View>(url, { body: patch });
    setBusy(false);
    if (r.ok) setV(r.data);
    else setErr(r.code === "plan_required" ? "Weekly autopilot is part of Solo, Studio and Agency. Choose a plan on the billing page." : r.message);
  }
  if (!v) return err ? <Notice tone="danger">{err}</Notice> : <Skeleton className="h-40 w-full" />;
  return (
    <div className="flex max-w-xl flex-col gap-6" data-testid="autopilot-settings">
      {err ? <Notice tone="warning">{err}</Notice> : null}
      {!subscriber && !v.weekly ? <Notice>Weekly autopilot needs a paid plan. Work orders stay pay per run.</Notice> : null}
      {v.quietSuggested && !v.quietMode ? <Notice tone="warning" title="Three pull requests in a row were closed" action={<Button size="sm" variant="secondary" loading={busy} onClick={() => save({ quietMode: true })}>Turn on quiet mode</Button>}>Autopilot keeps going until you say otherwise. Quiet mode pauses it.</Notice> : null}
      <div className="flex flex-col gap-3 rounded-none border border-border p-4">
        <p className="title-4 text-text">Weekly dependency pull request</p>
        <p className="body-6 text-text-subtle">Monday 06:00 in the zone below. One verified PR, refreshed while it stays open.{v.openPr ? ` Open now: #${v.openPr}.` : ""}</p>
        <div>
          <Button type="button" variant={v.weekly ? "secondary" : "primary"} loading={busy} aria-pressed={v.weekly} onClick={() => save({ weekly: !v.weekly })}>{v.weekly ? "Turn autopilot off" : "Turn autopilot on"}</Button>
        </div>
      </div>
      <Field label="Time zone" htmlFor="tz" hint="Daylight saving time is handled for you.">
        <Select id="tz" value={v.timezone} disabled={busy} onChange={(e) => save({ timezone: e.target.value })}>
          {(ZONES.includes(v.timezone) ? ZONES : [v.timezone, ...ZONES]).map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
        </Select>
      </Field>
      <label className="flex min-h-11 items-center gap-3 body-6 text-text">
        <input type="checkbox" className="size-5" checked={v.quietMode} disabled={busy} onChange={(e) => save({ quietMode: e.target.checked })} />
        Quiet mode: pause autopilot for this repo
      </label>
    </div>
  );
}
