import { fold } from "../lib/git-actions.ts";
import type { GitLog } from "../lib/git.ts";
import { cn } from "../lib/utils.ts";
import { GitIcon } from "./git-icon.tsx";

// The branch's commits at the foot, newest first, on a line: a filled dot is pushed, a ring is not, the first has the branch's name.
export function GitCommits({ log, head, shut }: { log: GitLog[]; head?: string; shut?: boolean }) {
  if (!log.length) return null;
  return (
    <section className="mt-auto border-t border-border pt-1.5">
      <div className="flex min-h-(--row) items-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <button
          type="button"
          aria-expanded={!shut}
          onClick={() => fold("log")}
          className="inline-flex items-center gap-1.5 text-foreground"
        >
          <GitIcon name="chev" className={cn("transition-transform", !shut && "rotate-90")} />
          Commits{" "}
          <span className="font-medium text-muted-foreground">
            {log.length}
            {log.length >= 50 ? "+" : ""}
          </span>
        </button>
      </div>
      {!shut && (
        <ol>
          {log.map((l, i) => (
            <li
              key={l.sha}
              title={l.sha + (l.unpushed ? " (not pushed)" : "")}
              className="relative flex min-h-[calc(var(--row)+2px)] items-center gap-2 pl-2 text-sm before:absolute before:bottom-0 before:left-[11px] before:top-0 before:w-0.5 before:bg-primary before:opacity-50 first:before:top-1/2 last:before:bottom-1/2"
            >
              <i
                className={cn(
                  "relative size-2 shrink-0 rounded-full bg-primary",
                  i === 0 && "shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_30%,transparent)]",
                  l.unpushed && "box-border border-2 border-primary bg-background",
                )}
              />
              <span className="min-w-0 flex-1 truncate">{l.subject}</span>
              {i === 0 && head && (
                <em className="rounded-full border border-primary px-1.5 font-mono text-xs not-italic text-primary">
                  {head}
                </em>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
