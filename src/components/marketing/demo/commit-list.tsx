import { cn } from "@/components/ui/cn";

const commits = [
  { sha: "a41f9c2", msg: "Raise PHP minimum to 8.3", recipe: "php-minimum@1.4.0" },
  { sha: "7be03d1", msg: "Set laravel/framework to ^13.0", recipe: "laravel-12-to-13@2.1.0" },
  { sha: "c9d8e47", msg: "Apply skeleton diff for bootstrap and config", recipe: "skeleton-13@2.1.0" },
  { sha: "02ab6f8", msg: "Bump first party packages", recipe: "first-party-13@1.9.2" },
  { sha: "e55d310", msg: "Repair: composer.platform", recipe: "repair@3.0.1", repair: true },
];

/** One recipe, one commit: each row has a short SHA, a name and the recipe version. */
export function CommitList({ className }: { className?: string }) {
  return (
    <figure aria-label="Example commit history" className={cn("border border-border bg-surface-raised", className)}>
      <ol>
        {commits.map((c) => (
          <li key={c.sha} className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 border-b border-border px-4 py-2 last:border-b-0">
            <span className="mono-data caption-3 text-action">{c.sha}</span>
            <span className="body-6 text-text">{c.msg}</span>
            <span />
            <span className={cn("mono-data caption-5", c.repair ? "text-info" : "text-text-subtle")}>{c.recipe}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
