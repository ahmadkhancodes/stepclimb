import { EOL_CALENDAR } from "@/lib/engine/detect/eol";
import { formatIso } from "@/content/dates";
import { cn } from "@/components/ui/cn";

/**
 * The EOL dateline: the signature strip under the masthead (docs/design-brief.md section 4).
 * Prints only sourced support end dates from the in-house EOL calendar, never a computed "days left",
 * so server and client render the same text.
 */
export function eolEntries() {
  const laravel = EOL_CALENDAR.laravel
    .filter((e): e is { major: number; securityEnd: string } => e.securityEnd !== null)
    .map((e) => ({ label: `Laravel ${e.major}`, iso: e.securityEnd }));
  const php = EOL_CALENDAR.php.map((p) => ({ label: `PHP ${p.version}`, iso: p.securityEnd }));
  return [...laravel.slice(-2), ...php].sort((a, b) => a.iso.localeCompare(b.iso));
}

export function Dateline({ className }: { className?: string }) {
  const entries = eolEntries();
  return (
    <div className={cn("border-b border-border bg-surface", className)}>
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 sm:px-6 lg:px-8">
        <p className="label-log shrink-0 text-text">Security support ends</p>
        <ul className="flex flex-wrap items-center gap-x-6 gap-y-1">
          {entries.map((e) => (
            <li key={e.label} className="caption-4 flex items-baseline gap-2 whitespace-nowrap text-text-subtle">
              <span className="text-text">{e.label}</span>
              <time dateTime={e.iso} className="mono-data">{formatIso(e.iso)}</time>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
