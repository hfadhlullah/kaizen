import { Markdown } from "@components/markdown";
import { cn } from "@lib/core";
import type { RunDoc } from "@lib/task";

// What the independent review found, numbered. Read-only: fixing findings is the run workspace's job.
export function ReviewView({ run, workspace }: { run: RunDoc | null; workspace?: string }) {
  if (!run?.review) return <p className="p-2 text-muted-foreground">There is no review yet.</p>;
  const open = run.findings.filter((f) => !f.done).length;
  return (
    <div className="flex flex-col gap-3">
      {run.findings.length ? (
        <>
          <p className="text-sm text-muted-foreground">
            {open ? `${open} open finding${open === 1 ? "" : "s"}` : "Every finding is closed"} of {run.findings.length}
          </p>
          <ol aria-label="Review findings" className="overflow-hidden rounded-lg border border-border bg-card">
            {run.findings.map((f) => (
              <li key={f.n} className="flex gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[11px] text-muted-foreground">
                  {f.n}
                </span>
                <Markdown
                  text={f.text}
                  className={cn("min-w-0 flex-1 [&_p]:mb-0", f.done && "text-muted-foreground line-through")}
                />
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className="p-2 text-muted-foreground">The review found nothing to fix.</p>
      )}
      {workspace && (
        <a href={workspace} className="text-sm text-muted-foreground underline">
          Open in the run workspace
        </a>
      )}
    </div>
  );
}
