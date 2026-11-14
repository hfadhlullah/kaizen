import { useLayoutEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { cn } from "@lib/core";
import {
  dragTracks,
  GAP,
  handleAt,
  handleBottom,
  shapeOf,
  sizesOf,
  terminalLayout,
  useArranged,
  useTerminalKeys,
  type Shape,
  type Sizes,
} from "@lib/terminal";
import { focusTerminal, TerminalTile } from "./terminal-tile.tsx";

type Axis = "c" | "r";
// A border between two tracks: drag to resize, double-click to even the axis out. The sizes are the grid's while it is
// dragged and saved when the pointer is up.
function Split({
  axis,
  i,
  sizes,
  shape,
  grid,
  live,
}: {
  axis: Axis;
  i: number;
  sizes: Sizes;
  shape: Shape;
  grid: RefObject<HTMLDivElement | null>;
  live: (s: Sizes | null, commit?: boolean) => void;
}) {
  const tr = sizes[axis];
  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const g = grid.current!,
      span = (axis === "c" ? g.clientWidth : g.clientHeight) - (tr.length - 1) * GAP,
      from = axis === "c" ? e.clientX : e.clientY;
    let last = sizes;
    live(sizes);
    // Listened on the window: the moves reach it whether or not the browser retargets them to the captured border.
    const move = (m: globalThis.PointerEvent) => {
        last = { ...sizes, [axis]: dragTracks(tr, i, (axis === "c" ? m.clientX : m.clientY) - from, span) };
        live(last);
      },
      up = () => {
        removeEventListener("pointermove", move);
        removeEventListener("pointerup", up);
        removeEventListener("pointercancel", up);
        live(last, true);
      };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
  };
  return (
    <div
      role="separator"
      aria-orientation={axis === "c" ? "vertical" : "horizontal"}
      title="Drag to resize, double-click to even out"
      className={cn(
        "absolute z-[2] touch-none hover:bg-[color-mix(in_srgb,var(--accent)_35%,transparent)] active:bg-[color-mix(in_srgb,var(--accent)_35%,transparent)]",
        axis === "c" ? "top-0 -ml-[5px] w-2.5 cursor-col-resize" : "inset-x-0 -mt-[5px] h-2.5 cursor-row-resize",
      )}
      style={
        axis === "c"
          ? { left: handleAt(sizes.c, i), bottom: handleBottom(sizes.r, i, shape.spanFrom) }
          : { top: handleAt(sizes.r, i) }
      }
      onPointerDown={down}
      onDoubleClick={() => terminalLayout.sizes(shape.key, { ...sizes, [axis]: tr.map(() => 1) })}
    />
  );
}

// The tiles. Each is placed by its place in the order and stays mounted for as long as it shows, so a /state tick moves
// nothing and reconnects nothing; only a reorder moves a tile, and the cursor goes back to where it was.
export function TerminalGrid() {
  const { a, all, lay, phone } = useArranged(),
    grid = useRef<HTMLDivElement>(null),
    [drag, setDrag] = useState<Sizes | null>(null),
    shape = shapeOf(a.keys.length, lay.mode, !!a.one),
    sizes = drag ?? sizesOf(lay.sizes[shape.key], shape),
    had = typeof document === "undefined" ? null : document.activeElement;
  useTerminalKeys(a.keys, phone, focusTerminal);
  useLayoutEffect(() => {
    if (had instanceof HTMLElement && had !== document.activeElement && had.isConnected)
      had.focus({ preventScroll: true });
  });
  if (!a.keys.length)
    return (
      <div className="flex flex-col items-center gap-3 py-[60px] text-center text-muted-foreground">
        <div className="mascot" />
        <b className="text-[16px] font-semibold text-foreground">
          {a.hid.length ? "Every terminal is hidden" : "No terminals running"}
        </b>
        <p className="mb-1.5 max-w-[44ch]">Runs with an agent open in kaizen show here, from Tasks to Done.</p>
      </div>
    );
  const live = (s: Sizes | null, commit?: boolean) => {
    if (commit && s) terminalLayout.sizes(shape.key, s);
    setDrag(commit ? null : s);
  };
  return (
    <div
      ref={grid}
      className={cn(
        "relative min-h-0 flex-1 gap-px bg-border",
        phone ? "flex flex-col" : "grid",
        drag && "select-none",
      )}
      style={
        phone
          ? undefined
          : {
              gridTemplateColumns: sizes.c.map((x) => x + "fr").join(" "),
              gridTemplateRows: sizes.r.map((x) => x + "fr").join(" "),
            }
      }
    >
      {a.keys.map((k, i) => (
        <TerminalTile
          key={k}
          k={k}
          c={all.get(k)!}
          index={i}
          off={!!a.one && a.one !== k}
          max={!phone && a.max === k}
          phone={phone}
          span={!a.one && i === a.keys.length - 1 ? shape.span : 1}
          order={a.order}
          noPointer={!!drag}
        />
      ))}
      {!a.one &&
        (["c", "r"] as const).flatMap((axis) =>
          sizes[axis]
            .slice(0, -1)
            .map((_, i) => (
              <Split key={axis + i} axis={axis} i={i} sizes={sizes} shape={shape} grid={grid} live={live} />
            )),
        )}
    </div>
  );
}
