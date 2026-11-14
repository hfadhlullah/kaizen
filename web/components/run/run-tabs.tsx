import { useState } from "react";
import { run, useRunView, type RvScreen } from "../../lib/run/index.ts";
import { cn } from "../../lib/core/index.ts";
import { Icon } from "@web/ui";
import { IconButton } from "../shared/index.ts";
import { RunAddMenu } from "./run-add-menu.tsx";

const MARKS = ["claude", "codex", "gemini"];
const KIND = {
  agent: "ai",
  shell: "term",
  local: "link",
  preview: "eye",
  note: "note",
  wait: "ai",
  history: "note",
} as Record<string, string>;
const small = "size-(--btn-xs) max-[640px]:size-8";

function Tab({ sc, on }: { sc: RvScreen; on: boolean }) {
  const [over, setOver] = useState(false),
    first = sc.first;
  return (
    <div
      draggable
      title={sc.title}
      onDragStart={(e) => {
        run.act.drag(sc.ids.includes(sc.focus) ? sc.focus : sc.ids[0]!);
        e.dataTransfer.setData("text/plain", sc.focus);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragEnd={() => run.act.drag(null)}
      onDragOver={(e) => {
        if (!run.act.dragging()) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        run.act.drop(sc.id);
      }}
      className={cn(
        "group/tab flex h-auto min-w-35 max-w-60 items-center gap-2 pl-3 pr-2 text-muted-foreground hover:bg-muted hover:text-foreground max-[640px]:min-w-0 max-[640px]:gap-1.5 max-[640px]:pl-2.5 max-[640px]:pr-0.5 max-[640px]:text-sm max-[640px]:hover:bg-transparent",
        on && "text-strong shadow-[inset_0_-2px_var(--ink-hi)] hover:text-strong",
        over && "bg-muted shadow-[inset_0_-2px_0_var(--accent)]",
      )}
    >
      <button
        type="button"
        role="tab"
        aria-selected={on}
        onClick={() => run.act.select(sc.id)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left max-[640px]:gap-1.5"
      >
        <Icon
          name={first.agent && MARKS.includes(first.agent) ? first.agent : (KIND[first.kind] ?? "ai")}
          className="size-(--ico) shrink-0"
        />
        <span className="min-w-0 flex-1 truncate max-[640px]:max-w-27.5 max-[640px]:flex-none">{sc.title}</span>
      </button>
      <button
        type="button"
        aria-label={`Close ${sc.title}`}
        title="Close tab"
        onClick={() => run.act.close(sc.id)}
        className={cn(
          "px-1 opacity-0 hover:opacity-100 focus-visible:opacity-60 group-hover/tab:opacity-60 max-[640px]:grid max-[640px]:size-7 max-[640px]:place-items-center max-[640px]:p-0 max-[640px]:opacity-60",
          on && "opacity-60",
        )}
      >
        ×
      </button>
    </div>
  );
}
// The workspace's tab bar: one tab per screen (items side by side count as one), the + menu, Run app, and the split menus.
// A tab or the + is a drop target for a dragged pane header (run-view.ts moves the item).
export function RunTabs() {
  const message = useRunView((s) => s.message),
    screens = useRunView((s) => s.screens),
    on = useRunView((s) => s.on),
    split = useRunView((s) => s.split),
    [plus, setPlus] = useState(false);
  if (message) return <span className="px-3 text-muted-foreground">{message}</span>;
  return (
    <>
      {screens.map((sc) => (
        <Tab key={sc.id} sc={sc} on={sc.id === on} />
      ))}
      <RunAddMenu mode="tab">
        <IconButton
          icon="plus"
          label="New tab"
          className={cn(
            small,
            "self-center",
            screens.length && "ml-1",
            plus && "bg-muted shadow-[inset_0_-2px_0_var(--accent)]",
          )}
          onDragOver={(e) => {
            if (!run.act.dragging()) return;
            e.preventDefault();
            setPlus(true);
          }}
          onDragLeave={() => setPlus(false)}
          onDrop={(e) => {
            e.preventDefault();
            setPlus(false);
            run.act.drop(null);
          }}
        />
      </RunAddMenu>
      <span className="flex-1" />
      <IconButton
        icon="play"
        label="Run app: start the dev server if it is off and open the app"
        aria-label="Run app"
        onClick={() => run.act.runApp()}
        className={cn(small, "self-center")}
      />
      {split && (
        <>
          <RunAddMenu mode="cols">
            <IconButton
              icon="lcols"
              label="Split right: add to this tab"
              aria-label="Split right"
              className={cn(small, "self-center max-[640px]:hidden")}
            />
          </RunAddMenu>
          <RunAddMenu mode="rows">
            <IconButton
              icon="lrows"
              label="Split down: add to this tab"
              aria-label="Split down"
              className={cn(small, "self-center max-[640px]:hidden")}
            />
          </RunAddMenu>
        </>
      )}
    </>
  );
}
