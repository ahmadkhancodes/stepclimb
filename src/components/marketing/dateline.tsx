import { EOL_CALENDAR } from "@/lib/engine/detect/eol";
import { formatIso } from "@/content/dates";
import { cn } from "@/components/ui/cn";

/**
 * The EOL title block: the signature strip under the masthead (docs/design-brief.md section 4).
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

/** Title block strip: like the corner block of a drawing, boxed cells with a field label above each date. */
export function Dateline({ className }: { className?: string }) {
  const entries = eolEntries();
  return (
    <div className={cn("border-b border-text bg-surface-raised", className)}>
      <div className="mx-auto flex w-full max-w-7xl items-stretch px-4 sm:px-6 lg:px-8">
        <p className="label-log flex shrink-0 items-center bg-surface-inverse px-3 py-2 text-text-inverse">
          <span className="sm:hidden">Support ends</span><span className="hidden sm:inline">Security support ends</span>
        </p>
        <ul className="flex min-w-0 flex-nowrap items-stretch overflow-x-auto border-r border-border">
          {entries.map((e) => (
            <li key={e.label} className="flex flex-col justify-center border-l border-border px-3 py-1 whitespace-nowrap">
              <span className="caption-5 text-text-subtle">{e.label}</span>
              <time dateTime={e.iso} className="mono-data caption-3 text-text">{formatIso(e.iso)}</time>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
