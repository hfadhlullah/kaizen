import { gutFrac, resizeAt, saveLayout, type Gut } from "@lib/run";
import { cn } from "@lib/core";

// The bar between two panes. Dragging it resizes both; the pointer is captured and the body class keeps frames from
// taking the moves, so the drag goes on over a frame. The sizes are saved when the drag ends.
export function PaneGutter({ g, wsk, sid, box }: { g: Gut; wsk: string; sid: string; box: () => DOMRect }) {
  const cols = g.dir === "cols",
    pct = (v: number) => `${v * 100}%`;
  return (
    <div
      role="separator"
      aria-orientation={cols ? "vertical" : "horizontal"}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        document.body.classList.add("rdrag");
        // Listened on the window: the moves reach it whether or not the browser retargets them to the captured bar.
        const move = (m: PointerEvent) => {
            const b = box();
            resizeAt(
              wsk,
              sid,
              g.path,
              g.i,
              gutFrac(g, cols ? (m.clientX - b.left) / b.width : (m.clientY - b.top) / b.height),
            );
          },
          up = () => {
            removeEventListener("pointermove", move);
            removeEventListener("pointerup", up);
            removeEventListener("pointercancel", up);
            document.body.classList.remove("rdrag");
            saveLayout();
          };
        addEventListener("pointermove", move);
        addEventListener("pointerup", up);
        addEventListener("pointercancel", up);
      }}
      style={
        cols
          ? { left: `calc(${pct(g.x)} - 0.5px)`, top: pct(g.y), height: pct(g.len), width: 1 }
          : { top: `calc(${pct(g.y)} - 0.5px)`, left: pct(g.x), width: pct(g.len), height: 1 }
      }
      className={cn(
        "absolute z-2 touch-none bg-border after:absolute after:content-['']",
        cols
          ? "after:inset-x-[-4px] after:inset-y-0 after:cursor-col-resize"
          : "after:inset-x-0 after:inset-y-[-4px] after:cursor-row-resize",
      )}
    />
  );
}
