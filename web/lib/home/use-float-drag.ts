import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { clampPlace, isDrag, readPlace, type Place } from "./home-window.ts";

// A floating thing the pointer drags anywhere in the window: its spot is kept per browser under `key` and read back
// clamped at `w` px wide. A press that moved 4 px or more is a drag, and `wasDrag()` says so once, to skip the click
// that follows it. Pointer events, so a finger and a mouse drag it the same way.
export function useFloatDrag(
  el: RefObject<HTMLElement | null>,
  key: string,
  w: number,
  skip: (e: ReactPointerEvent) => boolean,
) {
  const [at, setAt] = useState<Place | null>(() => {
    const p = readPlace(localStorageGet(key));
    return p && clampPlace(p, w, innerWidth, innerHeight);
  });
  const dragged = useRef(false);
  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button || skip(e) || !el.current) return;
    const r = el.current.getBoundingClientRect(),
      dx = e.clientX - r.left,
      dy = e.clientY - r.top;
    let last: Place | null = null;
    dragged.current = false;
    // Held down: the whole page shows the grabbing hand (html.grabbing, board.css), wherever the pointer strays.
    document.documentElement.classList.add("grabbing");
    const move = (m: PointerEvent) => {
      if (!dragged.current && !isDrag(m.clientX - e.clientX, m.clientY - e.clientY)) return;
      dragged.current = true;
      last = clampPlace({ x: m.clientX - dx, y: m.clientY - dy }, r.width, innerWidth, innerHeight);
      setAt(last);
    };
    const up = () => {
      document.documentElement.classList.remove("grabbing");
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
      if (last)
        try {
          localStorage.setItem(key, JSON.stringify(last));
        } catch {
          /* the spot lasts this page only */
        }
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
  };
  const wasDrag = () => {
    const d = dragged.current;
    dragged.current = false;
    return d;
  };
  return { at, onPointerDown, wasDrag };
}
const localStorageGet = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
