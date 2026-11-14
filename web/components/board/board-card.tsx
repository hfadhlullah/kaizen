import { useState } from "react";
import {
  actionOf,
  cardKey,
  chipsAndMarks,
  kidsOf,
  menuItems,
  runWords,
  statusIcon,
  statusTip,
  type Card,
  brief,
  age,
  cn,
} from "../../lib/core/index.ts";
import { showCard, openForm, useBoard, type FormMode } from "../../lib/board/index.ts";
import { archiveCard, backToTask, resumable, resumeRun } from "../../lib/run/index.ts";
import { Button } from "../../ui/button.tsx";
import { ActionMenu, StatusMark } from "../shared/index.ts";
import { CardFooter } from "./card-footer.tsx";
import { CardKids } from "./card-kids.tsx";

// One card of the Board: status mark, name, age and the Actions menu on the first line, then the title, then the one
// thing it asks of you as a button, then chips and marks. `pick` is Done's pick mode: pressing the card ticks it
// instead of opening it.
export function BoardCard({
  card: c,
  pick,
  picked,
  onPick,
}: {
  card: Card;
  pick: boolean;
  picked: boolean;
  onPick: () => void;
}) {
  const snap = useBoard((s) => s.snap)!,
    [busy, setBusy] = useState(false),
    k = cardKey(c),
    answered = snap.answered.includes(k + ":" + c.awaiting + ":" + c.moved),
    kids = kidsOf(snap.allCards, c),
    { chips, marks } = chipsAndMarks(c, snap.all),
    compact = c.column === 4 && !snap.archive,
    wk = c.workers || [];
  const items = menuItems(c, {
    archive: snap.archive,
    answered,
    otherProjects: snap.projects.some((p) => p.dir !== c.state),
  });
  const run = (id: string) => {
    if (id === "open") return showCard(c);
    if (id === "archive" || id === "restore") return void archiveCard(c, id === "archive");
    if (id === "toidea") return void backToTask(c);
    openForm({ mode: id as FormMode, key: k });
  };
  const act =
    c.kind === "run" && !snap.archive && !pick ? (
      c.status === "waiting" ? (
        <Button
          variant={answered ? "default" : "primary"}
          size="sm"
          className="min-h-6 self-start px-2.5 text-xs"
          onClick={(e) => (e.stopPropagation(), showCard(c))}
        >
          {actionOf(c, answered)}
        </Button>
      ) : c.status === "stalled" && resumable(c) ? (
        <Button
          size="sm"
          className="min-h-6 self-start px-2.5 text-xs"
          disabled={busy}
          onClick={async (e) => {
            e.stopPropagation();
            setBusy(true);
            await resumeRun(c);
            setBusy(false);
          }}
        >
          Resume
        </Button>
      ) : null
    ) : null;
  const onKey = (e: React.KeyboardEvent) => {
    if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) (e.preventDefault(), showCard(c));
  };
  return (
    <div
      role="button"
      tabIndex={0}
      data-k={k}
      onClick={() => (pick ? onPick() : showCard(c))}
      onKeyDown={pick ? undefined : onKey}
      className={cn(
        "card group relative flex cursor-pointer flex-col gap-1.5 rounded-sm border border-border bg-card px-3.5 py-3 shadow-sm transition-[border-color,box-shadow] hover:border-[color-mix(in_srgb,var(--dim)_45%,var(--line))] hover:shadow-md",
        k === snap.openKey &&
          "border-primary shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_22%,transparent)] hover:border-primary",
        snap.flash.includes(k) && "motion-safe:animate-flash",
        picked && "border-primary",
        compact && "flex-row items-center gap-2 px-3 py-[7px]",
      )}
    >
      {pick && (
        <input
          type="checkbox"
          aria-label="Select"
          checked={picked}
          readOnly
          className="pointer-events-none absolute right-3.5 top-3.5 m-0 accent-primary"
        />
      )}
      <div className={cn("flex min-h-[18px] items-center gap-2 text-xs text-muted-foreground", compact && "contents")}>
        <StatusMark name={statusIcon(c)} title={statusTip(c)} />
        <span
          title={c.kind === "run" && c.title ? c.title : undefined}
          className={cn(
            "min-w-0 flex-1 truncate tabular-nums",
            compact && "order-1 text-foreground",
            c.archived && "opacity-70",
          )}
        >
          {runWords(c)}
        </span>
        {!pick && (
          <>
            <span
              className={cn(
                "tabular-nums group-hover:hidden group-has-[[data-state=open]]:hidden",
                compact && "order-2",
              )}
            >
              {c.kind === "run" ? age(c.moved || snap.now, snap.now) : ""}
            </span>
            <ActionMenu
              label="Actions"
              size="sm"
              triggerClassName={cn(
                "-my-1 -mr-1.5 hidden group-focus-within:grid group-hover:grid data-[state=open]:grid max-[900px]:grid [@media(hover:none)]:grid",
                compact && "order-3",
              )}
              className="w-auto min-w-40 text-base"
              items={items.map((i) => ({ ...i, onSelect: () => run(i.id) }))}
            />
          </>
        )}
      </div>
      {!compact && (
        <>
          {c.signal === "blocked" ? (
            <div className="order-2 text-xs text-warning [overflow-wrap:anywhere]">{c.blocked?.question ?? ""}</div>
          ) : c.phase && c.status === "running" ? (
            <div className="order-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">{c.phase}</div>
          ) : null}
          <div
            title={c.kind === "idea" && brief(c.text ?? "").parts.length ? c.text : undefined}
            className={cn(
              "line-clamp-2 text-[13px] font-medium leading-[1.45] text-foreground",
              c.archived && "opacity-70",
            )}
          >
            {c.kind === "idea" ? brief(c.text ?? "").head : c.title || c.id}
          </div>
          {wk.length > 0 && (
            <div className="order-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">
              {wk.map((x) => `${x.id} ${x.status}${x.bypass ? " · bypass" : ""}`).join(" · ")}
              {c.workersMerge ? ` · merge ${c.workersMerge}` : ""}
            </div>
          )}
          {act}
          {(chips.length > 0 || marks.length > 0) && <CardFooter chips={chips} marks={marks} />}
          {kids.length > 0 && <CardKids k={k} kids={kids} />}
        </>
      )}
    </div>
  );
}
