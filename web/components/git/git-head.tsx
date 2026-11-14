import {
  PR_WORD,
  asideOf,
  sumRows,
  targetOf,
  type BranchDoc,
  type GitDoc,
  type GitRow,
  type Step,
  gitAct,
} from "@lib/git";
import { cn } from "@lib/core";
import { Icon } from "@web/ui";
import { GitCounts } from "./git-counts.tsx";
import { IconButton } from "@components/shared";

const chip =
  "mb-1.5 inline-flex h-(--btn-xs) items-center gap-1.5 self-start rounded-sm border border-border bg-card px-2 text-xs font-medium";
// The branch and its pull request at the top: the PR's state as a chip (a link, or Create PR, or Checking), the branch
// with its line totals, and where it goes.
export function GitHead({ g, b, rows, all }: { g: GitDoc; b: BranchDoc | null; rows: GitRow[]; all: Step[] }) {
  const pr = b?.pr,
    [add, del] = sumRows(rows);
  return (
    <div className="flex flex-col">
      {pr ? (
        <a
          className={cn(
            chip,
            "hover:bg-muted",
            pr.state === "OPEN" && !pr.draft && "text-success",
            pr.state === "MERGED" && "text-primary",
            (pr.state === "CLOSED" || pr.draft) && "text-muted-foreground",
          )}
          href={pr.url}
          target="_blank"
          rel="noopener"
          title="Open on GitHub"
        >
          <Icon name="git" sprite="t" className="size-(--ico-s)" />#{pr.number}{" "}
          {pr.draft && pr.state === "OPEN" ? "Draft" : PR_WORD[pr.state] || pr.state}
        </a>
      ) : b?.checking ? (
        <span className={cn(chip, "text-muted-foreground")}>Checking PR…</span>
      ) : b?.gh && !all.find((x) => x.a === "pr")!.why ? (
        <button type="button" className={cn(chip, "hover:bg-muted")} onClick={() => void gitAct("pr")}>
          <Icon name="git" sprite="t" className="size-(--ico-s)" />
          Create PR
        </button>
      ) : null}
      <div className="flex items-center gap-1.5 font-mono text-sm font-medium" title={asideOf(g) || g.branch}>
        <span className="min-w-0 flex-1 truncate">{b ? b.branch : g.branch || "HEAD"}</span>
        <GitCounts add={add} del={del} />
      </div>
      <div className="flex items-center gap-1.5 font-mono text-sm text-muted-foreground">
        → {targetOf(g, b)}
        {pr && (
          <IconButton
            icon="ext"
            label="Open on GitHub"
            href={pr.url}
            target="_blank"
            rel="noopener"
            className="ml-auto"
          />
        )}
      </div>
    </div>
  );
}
