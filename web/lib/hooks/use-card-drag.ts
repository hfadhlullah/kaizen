// The swipe card's gestures: it follows the pointer and tilts by its share of the width; past 100 px it decides, short
// of that it springs back. --p (-1..1) fades the PROMOTE and DISMISS stamps in. A thin imperative wrapper: styles are
// set on the element; the deck is told what was decided.
import { useRef, type PointerEvent } from "react";
import { host } from "../host.ts";

// A held or flying card is fixed to the window where it sits, so a scroll box or the page's own overflow cannot crop
// it on the way out.
const lift = (c: HTMLElement) => {
  if (c.dataset.lift) return;
  const r = c.getBoundingClientRect();
  Object.assign(c.style, {
    position: "fixed",
    zIndex: "95",
    margin: "0",
    left: r.left + "px",
    top: r.top + "px",
    width: r.width + "px",
    height: r.height + "px",
  });
  c.dataset.lift = "1";
};
const drop = (c: HTMLElement) => {
  delete c.dataset.lift;
  for (const k of ["position", "z-index", "margin", "left", "top", "width", "height", "transform"])
    c.style.removeProperty(k);
  c.style.removeProperty("--p");
};
// The card leaves to the side it was decided on.
export async function flyCard(c: HTMLElement | null, dir: 1 | -1) {
  if (!c || !host.motion()) return;
  lift(c);
  await c
    .animate(
      [
        { transform: getComputedStyle(c).transform },
        { transform: `translateX(${dir * innerWidth}px) rotate(${dir * 30}deg)`, opacity: 0 },
      ],
      { duration: 320, easing: "cubic-bezier(.3,.6,.4,1)", fill: "forwards" },
    )
    .finished.catch(() => {});
}
export function useCardDrag(onDecide: (op: "promote" | "dismiss") => void) {
  const ref = useRef<HTMLDivElement>(null);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const card = ref.current;
    if (!card || e.button || (e.target as Element).closest("a,button,summary,details")) return;
    const x0 = e.clientX;
    let dx = 0;
    card.setPointerCapture(e.pointerId);
    card.dataset.drag = "1";
    lift(card);
    card.onpointermove = (m) => {
      dx = m.clientX - x0;
      // Tilt by share of the card's width: a wide desktop card leans as much as a phone one.
      card.style.transform = `translateX(${dx}px) rotate(${(dx / card.offsetWidth) * 18}deg)`;
      card.style.setProperty("--p", String(Math.max(-1, Math.min(1, dx / 100))));
    };
    card.onpointerup = card.onpointercancel = () => {
      card.onpointermove = card.onpointerup = card.onpointercancel = null;
      delete card.dataset.drag;
      if (Math.abs(dx) > 100) return onDecide(dx > 0 ? "promote" : "dismiss");
      const from = card.style.transform;
      card.style.removeProperty("--p");
      const a =
        host.motion() && from
          ? card.animate([{ transform: from }, { transform: "none" }], {
              duration: 260,
              easing: "cubic-bezier(.3,1.4,.5,1)",
            })
          : null;
      card.style.transform = "";
      (a ? a.finished.catch(() => {}) : Promise.resolve()).then(() => drop(card));
    };
  };
  return { ref, onPointerDown };
}
