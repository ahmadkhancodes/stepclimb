"use client";
import { useState } from "react";
import { Check, Copy } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/components/ui/cn";

type Severity = "must" | "review" | "note";

const sev: Record<Severity, { label: string; cls: string }> = {
  must: { label: "Must fix", cls: "text-danger" },
  review: { label: "Review", cls: "text-info" },
  note: { label: "Note", cls: "text-text-subtle" },
};

/** Severity differs by shape as well as colour: square, triangle, circle. */
export function SeverityShape({ severity, size = 12 }: { severity: Severity; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" className={cn("shrink-0", sev[severity].cls)}>
      {severity === "must" ? <rect x="1" y="1" width="10" height="10" fill="currentColor" /> : null}
      {severity === "review" ? <path d="M6 1L11.5 11H0.5Z" fill="currentColor" /> : null}
      {severity === "note" ? <circle cx="6" cy="6" r="5" fill="currentColor" /> : null}
    </svg>
  );
}

export const agentPrompt = `Fix config/queue.php for Laravel 13.
File: config/queue.php, line 38
Failing output: Undefined array key "after_commit"
Guide: https://laravel.com/docs/13.x/upgrade
Change only this file, then run: composer install && php artisan test`;

const items: { severity: Severity; file: string; title: string }[] = [
  { severity: "must", file: "config/queue.php:38", title: "Skeleton diff conflict on after_commit" },
  { severity: "review", file: "bootstrap/app.php:14", title: "Middleware alias moved to the new builder" },
  { severity: "note", file: "composer.json:9", title: "PHP constraint raised from 8.2 to 8.3" },
];

/** A squawk drawer fragment: the list, then the ready prompt for your own agent, with a copy button. */
export function SquawkDrawer() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(agentPrompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <figure aria-label="Example squawk drawer" className="border border-border bg-surface-raised">
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
        <p className="body-4 text-text">Squawks <span className="mono-data body-6 text-text-subtle">3 open</span></p>
        <span className="caption-4 text-text-subtle">Example, fictional repo</span>
      </div>
      <ul>
        {items.map((s) => (
          <li key={s.file} className="grid grid-cols-[auto_1fr] items-start gap-x-3 gap-y-0.5 border-b border-border px-4 py-3">
            <span className="mt-1.5"><SeverityShape severity={s.severity} /></span>
            <span className="body-5 text-text">{s.title}</span>
            <span />
            <span className="mono-data caption-5 text-text-subtle"><span className={cn("caption-3 mr-2", sev[s.severity].cls)}>{sev[s.severity].label}</span>{s.file}</span>
          </li>
        ))}
      </ul>
      <div className="p-4">
        <div className="mb-2 flex items-center justify-between gap-4">
          <p className="label-log text-text-subtle">Prompt for your own agent</p>
          <button
            type="button"
            onClick={copy}
            className="button-sm inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-link transition-colors duration-300 ease-out-kit hover:bg-action-soft focus-visible:focus-ring active:scale-[0.98]"
          >
            {copied ? <Check size={16} weight="regular" aria-hidden /> : <Copy size={16} weight="regular" aria-hidden />}
            {copied ? "Copied" : "Copy prompt"}
          </button>
        </div>
        <pre className="mono-data caption-5 overflow-x-auto whitespace-pre-wrap break-words border border-border bg-surface p-3 text-text">{agentPrompt}</pre>
        <p role="status" className="sr-only">{copied ? "Prompt copied" : ""}</p>
      </div>
    </figure>
  );
}
