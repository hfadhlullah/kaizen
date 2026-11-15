// The phone row's gestures: drag mostly sideways past 35 % of the row's width to decide (right makes a task, left
// dismisses), hold 500 ms to snooze. The page keeps scrolling: a drag counts only once it is mostly sideways
// (touch-action: pan-y hands every vertical move to the browser, which cancels the pointer). This is a thin
// imperative wrapper: it moves the foreground by style and tells the row what was decided.
import { useRef, type PointerEvent } from "react";
import { SWIPE_AT } from "./icebox.ts";

export function useRowSwipe({
  onDecide,
  onHold,
  enabled,
}: {
  onDecide: (op: "promote" | "dismiss") => Promise<boolean | void> | void; // false: it failed, the row comes back
  onHold: () => void;
  enabled: boolean;
}) {
  const row = useRef<HTMLDivElement>(null),
    fg = useRef<HTMLDivElement>(null);
  // A tap after a drag or a hold must not also open the row. A hold redraws the page under the finger, so the click
  // that follows its release lands on the new menu: it is eaten on the whole document until just after that release.
  const eat = (hold: boolean) => {
    const k = (c: Event) => {
      c.stopPropagation();
      c.preventDefault();
    };
    document.addEventListener("click", k, { capture: true, once: true });
    let gone = false;
    const off = () => {
      if (gone) return;
      gone = true;
      document.removeEventListener("pointerup", off, { capture: true });
      document.removeEventListener("pointercancel", off, { capture: true });
      setTimeout(() => document.removeEventListener("click", k, { capture: true }), 60);
    };
    if (hold) {
      // Released, cancelled by the browser, or left far too long: the blocker goes either way.
      document.addEventListener("pointerup", off, { capture: true });
      document.addEventListener("pointercancel", off, { capture: true });
      setTimeout(off, 5000);
    } else off();
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const r = row.current,
      f = fg.current;
    if (
      !enabled ||
      !r ||
      !f ||
      e.button ||
      r.dataset.gone ||
      (e.target as Element).closest("a,input,button,summary,[role=menuitem]")
    )
      return;
    const x0 = e.clientX,
      y0 = e.clientY;
    let dx = 0,
      mode = "";
    const hold = setTimeout(() => {
      if (mode) return;
      mode = "hold";
      eat(true);
      navigator.vibrate?.(10);
      onHold();
    }, 500);
    const home = () => {
      f.style.transform = "";
      f.style.opacity = "";
      r.style.removeProperty("--p");
      delete r.dataset.dir;
      delete r.dataset.gone;
    };
    const end = (cancel: boolean) => {
      clearTimeout(hold);
      f.onpointermove = f.onpointerup = f.onpointercancel = null;
      if (mode !== "drag") return;
      delete r.dataset.drag;
      eat(false);
      if (!cancel && Math.abs(dx) > r.offsetWidth * SWIPE_AT) {
        const op = dx > 0 ? "promote" : "dismiss";
        r.dataset.gone = "1";
        f.style.transform = `translateX(${(dx > 0 ? 1 : -1) * r.offsetWidth}px)`;
        f.style.opacity = "0";
        void Promise.resolve(onDecide(op)).then((ok) => ok === false && home());
      } else home();
    };
    f.onpointermove = (m) => {
      const mx = m.clientX - x0,
        my = m.clientY - y0;
      if (!mode) {
        if (Math.hypot(mx, my) > 8) clearTimeout(hold);
        if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my)) {
          mode = "drag";
          f.setPointerCapture(m.pointerId);
          r.dataset.drag = "1";
        } else if (Math.abs(my) > 10) mode = "scroll";
      }
      if (mode !== "drag") return;
      dx = mx;
      f.style.transform = `translateX(${dx}px)`;
      r.dataset.dir = dx > 0 ? "pro" : "dis";
      r.style.setProperty("--p", String(Math.min(1, Math.abs(dx) / (r.offsetWidth * SWIPE_AT))));
    };
    f.onpointerup = () => end(false);
    f.onpointercancel = () => end(true);
  };
  return { row, fg, onPointerDown };
}
