import type { ReactNode, Ref } from "react";
import { cn } from "@lib/core";
import { Icon } from "@web/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@web/ui";

// The frame of a side panel, the same for the task page's conversation and, later, the run workspace's panel: a header
// block, a body, a foot, and a strip of icon buttons down the right edge. Folded, only the strip is left.
export function PanelFrame({
  header,
  body,
  foot,
  strip,
  folded,
  label,
  className,
  id,
  rootRef,
  flush,
  extra,
  as: Root = "div",
  hidden,
}: {
  header: ReactNode;
  body: ReactNode;
  foot?: ReactNode;
  strip: ReactNode;
  folded?: boolean;
  label: string;
  className?: string;
  id?: string;
  rootRef?: Ref<HTMLDivElement>;
  // The body and the foot bring their own padding and scrolling (the run workspace's own elements do); the frame only places them.
  flush?: boolean;
  // Drawn inside the frame, on top of it: the run workspace's resize grip.
  extra?: ReactNode;
  // The run workspace keeps an <aside>: the board's old rules for a panel's inside (its body, footer, tabs) hang off it.
  as?: "div" | "aside";
  // No panel to show (the run workspace with no run): not drawn. `!hidden` because the frame's own display utility would otherwise win.
  hidden?: boolean;
}) {
  return (
    <Root
      id={id}
      ref={rootRef as never}
      role="complementary"
      aria-label={label}
      // The run workspace panel's metrics, from the tokens in board.css (--panel-*): its width is the one the board
      // remembers (--rpanel-w), the strip, the canvas colour and no border.
      style={folded ? undefined : { width: "var(--rpanel-w, var(--panel-w))" }}
      className={cn(
        "relative grid min-h-0 flex-none grid-rows-[auto_minmax(0,1fr)_auto] bg-canvas transition-[width] duration-300 motion-reduce:transition-none",
        folded
          ? "w-[var(--panel-strip)] grid-cols-[var(--panel-strip)]"
          : "grid-cols-[minmax(0,1fr)_var(--panel-strip)] max-md:!w-full",
        hidden && "!hidden",
        className,
      )}
    >
      {!folded && (
        <div
          className="col-start-1 row-start-1 min-w-0 px-[var(--panel-pad-x)] pb-[var(--panel-head-bot)] pt-[var(--panel-head-top)]"
          // The desktop app's window controls overlay the top right of the run workspace: keep clear of them (--wco, --wch are set there).
          style={flush ? { paddingRight: "calc(var(--panel-pad-x) + var(--wco, 0px))" } : undefined}
        >
          {header}
        </div>
      )}
      <div
        className={cn(
          "row-span-3 row-start-1 flex flex-col items-center pt-2.5",
          folded ? "col-start-1" : "col-start-2",
        )}
        // Window controls overlay the top right of the desktop app (--wch is their height there).
        style={flush ? { paddingTop: "calc(10px + var(--wch, 0px))" } : undefined}
      >
        {strip}
      </div>
      {!folded && (
        <div
          className={cn(
            "col-start-1 row-start-2 min-h-0 min-w-0",
            flush
              ? "flex flex-col overflow-hidden"
              : "overflow-auto px-[var(--panel-pad-x)] pb-[var(--panel-body-bot)] pt-[var(--panel-body-top)]",
          )}
        >
          {body}
        </div>
      )}
      {!folded && foot && (
        <div
          className={cn(
            "col-start-1 row-start-3 min-w-0",
            !flush && "px-[var(--panel-pad-x)] py-[var(--panel-foot-y)]",
          )}
        >
          {foot}
        </div>
      )}
      {extra}
    </Root>
  );
}
export type PanelStripItem = { id: string; icon: string; label: string; sprite?: "i" | "t" | "r"; dot?: boolean };
// The icon strip: one button per view. Pressing the open view folds the panel; pressing another opens it on that view.
export function PanelStrip({
  items,
  active,
  folded,
  onPick,
}: {
  items: PanelStripItem[];
  active: string;
  folded?: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          title={folded || it.id !== active ? it.label : `Hide the panel`}
          aria-label={it.label}
          aria-pressed={!folded && it.id === active}
          onClick={() => onPick(it.id)}
          className={cn(
            "relative grid size-8 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground",
            !folded && it.id === active && "bg-muted text-foreground",
          )}
        >
          <Icon sprite={it.sprite ?? "t"} name={it.icon} className="size-[17px]" />
          {it.dot && (
            <i className="absolute right-[5px] top-[5px] size-2 rounded-full bg-warning shadow-[0_0_0_2px_var(--bg)]" />
          )}
        </button>
      ))}
    </div>
  );
}
// The thin bar under the title: how far along, with the stage word in the colour of what it means.
export function PanelProgress({
  word,
  pct,
  tone,
}: {
  word: string;
  pct: number;
  tone: "wait" | "run" | "ok" | "idle";
}) {
  const c = tone === "wait" ? "text-warning" : tone === "ok" ? "text-success" : "text-muted-foreground",
    bar = tone === "wait" ? "bg-warning" : tone === "ok" ? "bg-success" : "bg-muted-foreground";
  return (
    <div role="status" className={cn("flex min-w-0 flex-1 items-center gap-2 text-xs", c)}>
      <span className="shrink-0 whitespace-nowrap">{word}</span>
      <span
        role="progressbar"
        aria-label="Progress"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-[3px] min-w-0 flex-1 overflow-hidden rounded-sm bg-border"
      >
        <i
          className={cn("block h-full rounded-sm transition-[width] duration-500 motion-reduce:transition-none", bar)}
          style={{ width: pct + "%" }}
        />
      </span>
    </div>
  );
}
export type PanelPickItem = { id: string; label: string; hint?: string; mark?: ReactNode };
// The title as a picker: a dropdown of the other items of the same kind (tasks of a project), a mark in front.
export function PanelPicker({
  current,
  mark,
  items,
  onPick,
}: {
  current: string;
  mark?: ReactNode;
  items: PanelPickItem[];
  onPick: (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Choose another"
          className="-ml-2 flex min-h-[30px] w-full items-center gap-2 rounded-sm px-2 text-foreground hover:bg-muted [&[aria-expanded=true]_svg:last-child]:rotate-180"
        >
          {mark}
          <b className="min-w-0 flex-1 truncate text-left text-sm font-medium leading-[1.4]">{current}</b>
          <Icon name="chev" className="size-3 shrink-0 text-muted-foreground transition-transform" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[min(60vh,420px)] w-(--radix-dropdown-menu-trigger-width) min-w-[260px] overflow-y-auto"
      >
        {items.map((it) => (
          <DropdownMenuItem key={it.id} onSelect={() => onPick(it.id)} className="min-h-[30px] gap-2 text-sm">
            {it.mark}
            <b className="min-w-0 flex-1 truncate font-medium text-foreground">{it.label}</b>
            {it.hint && <small className="max-w-[40%] shrink truncate text-xs text-muted-foreground">{it.hint}</small>}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
