import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  edgeOf,
  focusItem,
  moveInLayout,
  refreshPreview,
  run,
  setDragging,
  useLayout,
  type Rect,
  type RvPane,
} from "@lib/run";
import { cn } from "@lib/core";
import { BrowserPane } from "./browser-pane.tsx";
import { PaneHeader } from "./pane-header.tsx";
import { RunHistory } from "./run-history.tsx";
import { RunWait } from "./run-wait.tsx";
import { TerminalPane } from "./terminal-pane.tsx";

const pct = (v: number) => `${v * 100}%`;
// Where a dragged item lands on this pane: an inset bar on the nearest edge.
const EDGE = {
  l: "shadow-[inset_3px_0_0_var(--accent)]",
  r: "shadow-[inset_-3px_0_0_var(--accent)]",
  t: "shadow-[inset_0_3px_0_var(--accent)]",
  b: "shadow-[inset_0_-3px_0_var(--accent)]",
};

// The Preview tab is still the old code's drawing (web/board/run-view.ts): it fills this element, and again when a
// screenshot is written for the workspace.
function PreviewBody() {
  const el = useRef<HTMLDivElement>(null),
    tick = useLayout((s) => s.previewTick);
  useEffect(() => {
    el.current!.replaceChildren();
    run.act.mountPreview(el.current!);
  }, [tick]);
  // kz-keep: the old drawing's own classes (.rprev, .urlbar, .shots) are not reset by the kit's scoped preflight.
  return <div ref={el} className="contents kz-keep" />;
}

function Body({ item, wsk, ws }: { item: RvPane; wsk: string; ws: { dir: string } | null }) {
  switch (item.kind) {
    case "agent":
    case "shell":
      return <TerminalPane sessionKey={item.key!} />;
    case "history":
      return <RunHistory />;
    case "wait":
      return <RunWait id={item.id} />;
    case "local":
      return <BrowserPane wsk={wsk} />;
    case "note":
      return (
        <iframe
          className="rframe"
          title={item.title}
          src={`/notebook?dir=${encodeURIComponent(ws?.dir ?? "")}&note=${encodeURIComponent(item.note!)}&embed=1`}
        />
      );
    default:
      return <PreviewBody />;
  }
}

// One item of the workspace. It is placed by its rectangle in the layout (never moved in the DOM), so a split, a
// resize or a drag redraws its box and leaves the terminal or frame inside it as it is. Its header is the handle for
// dragging it onto a tab, onto + (a tab of its own) or onto another pane's edge (split there, on that side).
export function Pane({
  item,
  rect,
  wsk,
  ws,
  sid,
  split,
  focus,
}: {
  item: RvPane;
  rect?: Rect;
  wsk: string;
  ws: { dir: string } | null;
  sid: string | null;
  split: boolean;
  focus: boolean;
}) {
  const [edge, setEdge] = useState<keyof typeof EDGE | null>(null),
    dragging = useLayout((s) => s.dragging),
    over = dragging && dragging !== item.id;
  useEffect(() => {
    if (!dragging) setEdge(null);
  }, [dragging]);
  const style: CSSProperties | undefined = rect && {
    left: pct(rect.l),
    top: pct(rect.t),
    width: pct(rect.w),
    height: pct(rect.h),
  };
  return (
    <section
      className={cn(
        "rpane absolute flex min-h-0 min-w-0 flex-col bg-background pt-2 has-[>.term]:bg-[var(--term-bg,var(--bg))]",
        !rect && "hidden",
        split &&
          "focus-within:after:absolute focus-within:after:inset-0 focus-within:after:z-3 focus-within:after:pointer-events-none focus-within:after:shadow-[inset_0_0_0_1px_var(--accent)] focus-within:after:content-['']",
        focus && "focus outline outline-1 -outline-offset-1 outline-(--accent)",
        edge && EDGE[edge],
      )}
      data-t={item.id}
      hidden={!rect}
      style={style}
      // The pane last clicked is the one a split divides.
      onPointerDown={() => focusItem(wsk, item.id)}
      onDragOver={(e) => {
        if (!over) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect();
        setEdge(edgeOf((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height));
      }}
      onDragLeave={() => setEdge(null)}
      onDrop={(e) => {
        if (!over || !sid) return;
        e.preventDefault();
        const r = e.currentTarget.getBoundingClientRect(),
          d = edgeOf((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
        setEdge(null);
        moveInLayout(wsk, dragging!, sid, {
          pane: item.id,
          dir: d === "l" || d === "r" ? "cols" : "rows",
          before: d === "l" || d === "t",
        });
        setDragging(null);
      }}
    >
      <header
        className={cn(
          "ph flex h-(--pane-h) cursor-grab items-center justify-between gap-1.5 px-2.5 pt-1 text-[11px] text-muted-foreground",
          !split && "hidden",
        )}
        draggable
        onDragStart={(e) => {
          setDragging(item.id);
          e.dataTransfer.setData("text/plain", item.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => setDragging(null)}
      >
        <PaneHeader id={item.id} />
      </header>
      <Body item={item} wsk={wsk} ws={ws} />
    </section>
  );
}
