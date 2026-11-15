// Ranking projects: press a project's bar and drag it up or down (pointer events, so a mouse and a finger work alike).
// A mouse starts after 5 px of movement; a finger after a 300 ms hold without moving, so a quick swipe still scrolls the
// sidebar. The view says which bar is lifted and which slot the line shows; letting go calls `onDrop` with the new order.
// Escape or a cancelled pointer puts it back. The click that ends a drag does not fold (`swallow`).
import { useEffect, useRef, useState, type RefObject } from "react";
import { landingSlot, rankedOrder } from "./rules.ts";

export type RankView = { lift: string | null; to: number };
const IDLE: RankView = { lift: null, to: -1 };
type Drag = {
  dir: string;
  bar: HTMLElement;
  id: number;
  x: number;
  y: number;
  hold?: ReturnType<typeof setTimeout>;
  to: number;
};

export function useRankDrag(ref: RefObject<HTMLElement | null>, onDrop: (order: string[]) => void) {
  const [view, setView] = useState<RankView>(IDLE);
  const click = useRef(false);
  const drop = useRef(onDrop);
  drop.current = onDrop;
  useEffect(() => {
    const box = ref.current;
    if (!box) return;
    let d: Drag | null = null,
      ranking = false;
    const groups = () => [...box.querySelectorAll<HTMLElement>(":scope > .pgrp")];
    const show = (v: RankView) => setView((o) => (o.lift === v.lift && o.to === v.to ? o : v));
    const end = (save: boolean) => {
      if (!d) return;
      clearTimeout(d.hold);
      const was = ranking,
        { dir, to } = d;
      const dirs = groups().map((g) => g.querySelector<HTMLElement>(".proj")!.dataset.proj!);
      d = null;
      ranking = false;
      show(IDLE);
      if (was) click.current = true; // the click that follows this pointerup
      const next = was && save ? rankedOrder(dirs, dir, to) : null;
      if (next) drop.current(next);
      if (was) setTimeout(() => (click.current = false), 0);
    };
    const start = () => {
      if (!d) return;
      ranking = true;
      show({ lift: d.dir, to: d.to });
      try {
        d.bar.setPointerCapture(d.id);
      } catch {}
      navigator.vibrate?.(8);
    };
    const down = (e: PointerEvent) => {
      const bar = (e.target as HTMLElement).closest<HTMLElement>(".pgrp > .proj");
      if (!bar || e.button !== 0 || bar.parentElement?.parentElement !== box) return;
      d = { dir: bar.dataset.proj!, bar, id: e.pointerId, x: e.clientX, y: e.clientY, to: -1 };
      if (e.pointerType !== "mouse") d.hold = setTimeout(start, 300);
    };
    const move = (e: PointerEvent) => {
      if (!d || e.pointerId !== d.id) return;
      const far = Math.hypot(e.clientX - d.x, e.clientY - d.y);
      if (!ranking) {
        if (e.pointerType === "mouse" ? far > 5 : far > 8) e.pointerType === "mouse" ? start() : end(false);
        if (!ranking) return;
      }
      e.preventDefault();
      d.to = landingSlot(
        groups().map((g) => g.getBoundingClientRect()),
        e.clientY,
      );
      show({ lift: d.dir, to: d.to });
    };
    const up = (e: PointerEvent) => d && e.pointerId === d.id && end(true);
    const cancel = () => end(false);
    // A held finger: no page scroll and no long-press menu while it drags.
    const touch = (e: TouchEvent) => ranking && e.preventDefault();
    const menu = (e: Event) => d && e.preventDefault();
    const key = (e: KeyboardEvent) => {
      if (ranking && e.key === "Escape") (e.preventDefault(), end(false));
    };
    box.addEventListener("pointerdown", down);
    box.addEventListener("pointermove", move);
    box.addEventListener("pointerup", up);
    box.addEventListener("pointercancel", cancel);
    box.addEventListener("touchmove", touch, { passive: false });
    box.addEventListener("contextmenu", menu, true);
    addEventListener("keydown", key);
    return () => {
      clearTimeout(d?.hold);
      box.removeEventListener("pointerdown", down);
      box.removeEventListener("pointermove", move);
      box.removeEventListener("pointerup", up);
      box.removeEventListener("pointercancel", cancel);
      box.removeEventListener("touchmove", touch);
      box.removeEventListener("contextmenu", menu, true);
      removeEventListener("keydown", key);
    };
  }, [ref]);
  // True once for the click that ends a drag.
  const swallow = () => {
    const was = click.current;
    click.current = false;
    return was;
  };
  return { view, swallow };
}
