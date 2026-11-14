import { gitAct, fold, busyOf, useGit } from "../lib/git/index.ts";
import type { GitRow as Row } from "../lib/git/index.ts";
import { cn } from "../lib/core/index.ts";
import { GitCounts } from "./git-counts.tsx";
import { GitIcon } from "./git-icon.tsx";
import { Icon } from "../ui/icon.tsx";
import { IconButton } from "./icon-button.tsx";

const small =
  "size-[calc(var(--row)-4px)] min-w-[calc(var(--row)-4px)] [&_svg]:size-(--ico-s) [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:stroke-2";
const act = (
  label: string,
  a: Parameters<typeof gitAct>[0],
  icon: "undo" | "minus" | "plus",
  path = "",
  untracked = false,
  busy = false,
) => (
  <IconButton
    key={a}
    icon={icon === "plus" ? <Icon name="plus" /> : <GitIcon name={icon} />}
    label={label}
    disabled={busy}
    onClick={() => void gitAct(a, path, untracked)}
    className={small}
  />
);

function FileRow({ r }: { r: Row }) {
  const busy = useGit((s) => !!busyOf(s)),
    i = r.path.lastIndexOf("/"),
    name = r.path.slice(i + 1),
    dir = i > 0 ? r.path.slice(0, i) : "";
  return (
    <li
      className="group/row flex min-h-[calc(var(--row)+2px)] items-center gap-2 rounded-sm px-2 hover:bg-muted"
      title={r.path}
    >
      <GitIcon name="file" className="text-warning" />
      <span className="min-w-0 flex-1 truncate">
        {name}
        {dir && <small className="ml-1.5 text-xs text-muted-foreground">{dir}</small>}
      </span>
      <span className="grid h-full items-center justify-items-end [&>*]:[grid-area:1/1]">
        <span className="invisible inline-flex group-focus-within/row:visible group-hover/row:visible pointer-coarse:visible">
          {r.staged
            ? act(`Unstage ${r.path}`, "unstage", "minus", r.path, false, busy)
            : [
                act(`Discard changes to ${r.path}`, "discard", "undo", r.path, r.code === "U", busy),
                act(`Stage ${r.path}`, "stage", "plus", r.path, false, busy),
              ]}
        </span>
        <span className="inline-flex items-center gap-1.5 group-focus-within/row:invisible group-hover/row:invisible pointer-coarse:invisible">
          <GitCounts add={r.add} del={r.del} />
          <span
            className={cn(
              "w-(--ico) text-center font-mono text-xs font-semibold text-warning",
              (r.code === "A" || r.code === "U") && "text-success",
              r.code === "D" && "text-danger",
            )}
          >
            {r.code}
          </span>
        </span>
      </span>
    </li>
  );
}
// Staged changes, or the changes still to stage: folds shut, with the actions for the whole group.
export function GitFiles({
  id,
  title,
  rows,
  shut,
}: {
  id: "staged" | "changes";
  title: string;
  rows: Row[];
  shut?: boolean;
}) {
  const busy = useGit((s) => !!busyOf(s));
  if (!rows.length) return null;
  return (
    <section>
      <div className="flex min-h-(--row) items-center justify-between gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <button
          type="button"
          aria-expanded={!shut}
          onClick={() => fold(id)}
          className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wide text-foreground"
        >
          <GitIcon name="chev" className={cn("transition-transform", !shut && "rotate-90")} />
          {title} <span className="font-medium text-muted-foreground">{rows.length}</span>
        </button>
        <span className="inline-flex">
          {id === "staged"
            ? act("Unstage all", "unstageall", "minus", "", false, busy)
            : [
                act("Discard all changes", "discardall", "undo", "", false, busy),
                act("Stage all", "stageall", "plus", "", false, busy),
              ]}
        </span>
      </div>
      {!shut && (
        <ul>
          {rows.map((r) => (
            <FileRow key={(r.staged ? "s:" : "u:") + r.path} r={r} />
          ))}
        </ul>
      )}
    </section>
  );
}
