// A phone's run sheet (the run panel, a bottom sheet over the run workspace): drag it down from anywhere its content is at
// the top, or tap outside it, to close it. The decision is pure (sheet-swipe.test.ts); `bindSheetSwipe` wires it to the old
// panel element. It stays on touch events, not pointer events: the drag has to cancel the browser's own scroll
// (preventDefault on touchmove), and a pointer stream is cancelled once the browser starts that scroll.
const DRAG_FROM = 10; // a finger drifts a few pixels in a tap; taking those as a drag would cancel its click
// The sheet follows the finger once it moved past a tap's drift.
export const dragging = (dy: number) => dy > DRAG_FROM;
// A drag closes the sheet when it went far (100 px) or was a quick flick (30 px in under 250 ms).
export const closes = (dy: number, ms: number) => dy > 100 || (dy > 30 && ms < 250);

export function bindSheetSwipe(o: { panel: HTMLElement; active: () => boolean; close: () => void; keep: string }) {
  const { panel: p } = o;
  let y0: number | null = null,
    t0 = 0,
    dy = 0;
  const scrolled = (t: EventTarget | null) => ((t as Element).closest?.(".body")?.scrollTop ?? 0) > 0;
  p.addEventListener(
    "touchstart",
    (e) => {
      y0 = o.active() && e.touches.length === 1 && !scrolled(e.target) ? e.touches[0]!.clientY : null;
      t0 = Date.now();
      dy = 0;
    },
    { passive: true },
  );
  p.addEventListener(
    "touchmove",
    (e) => {
      if (y0 === null) return;
      if (scrolled(e.target)) return void (y0 = null);
      dy = e.touches[0]!.clientY - y0;
      if (!dragging(dy)) return void (p.style.translate = "");
      e.preventDefault();
      p.style.transition = "none";
      p.style.translate = `0 ${dy}px`;
    },
    { passive: false },
  );
  const end = () => {
    if (y0 === null) return;
    y0 = null;
    p.style.transition = "";
    if (closes(dy, Date.now() - t0)) {
      p.style.translate = "0 100%";
      setTimeout(() => (o.close(), (p.style.translate = "")), 180);
    } else p.style.translate = "";
  };
  p.addEventListener("touchend", end);
  p.addEventListener("touchcancel", end);
  // composedPath, not target: a strip button redraws #ptabs in its own click, so by here the target is detached and
  // closest() would call a tap inside the sheet an outside one.
  addEventListener(
    "click",
    (e) => o.active() && !e.composedPath().some((n) => (n as Element).matches?.(o.keep)) && o.close(),
  );
}
