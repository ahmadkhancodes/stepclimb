import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export interface FactTableProps {
  caption: string;
  /** Header cells, the first is the row header column. */
  columns: string[];
  rows: ReactNode[][];
  /** Zero based index of a column to tint (ours). */
  highlight?: number;
  /** Indexes of columns whose figures use the mono face. */
  mono?: number[];
  minWidth?: string;
}

/** Ruled table: square corners, 1px rules, row headers, scrolls inside its own region on small screens. */
export function FactTable({ caption, columns, rows, highlight, mono = [], minWidth = "min-w-144" }: FactTableProps) {
  return (
    <div role="region" aria-label={`${caption}. Scrolls sideways on small screens.`} tabIndex={0} className="overflow-x-auto rounded-none border border-border bg-surface focus-visible:focus-ring">
      <table className={cn("w-full border-collapse text-left", minWidth)}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border-strong bg-surface-raised">
            {columns.map((c, i) => (
              <th key={c} scope="col" className={cn("px-4 py-3 title-4 text-text", i === highlight && "bg-surface-sunken")}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-border last:border-b-0">
              {r.map((cell, ci) =>
                ci === 0 ? (
                  <th key={ci} scope="row" className="w-1/4 px-4 py-3 align-top body-5 text-text">{cell}</th>
                ) : (
                  <td key={ci} className={cn("px-4 py-3 align-top body-6 text-text-subtle", mono.includes(ci) && "mono-data", ci === highlight && "bg-surface-raised text-text")}>{cell}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
