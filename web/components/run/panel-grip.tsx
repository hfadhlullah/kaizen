import { useEffect } from "react";
import { GRIP_KEY, setPanelWidth } from "@lib/run";

// The run panel's left edge: drag to resize it, double-click to put it back. The width is kept for next time. The body
// class keeps frames from taking the pointer while it moves (the panel's CSS shows the grip only in the run view).
export function PanelGrip() {
  useEffect(() => {
    try {
      const w = Number(localStorage.getItem(GRIP_KEY));
      if (w) setPanelWidth(w);
    } catch {
      /* private window: default width */
    }
  }, []);
  return (
    <div
      id="rgrip"
      title="Drag to resize, double-click to reset"
      onPointerDown={(e) => {
        e.preventDefault();
        const grip = e.currentTarget,
          panel = grip.parentElement!.parentElement!;
        grip.setPointerCapture(e.pointerId);
        document.body.classList.add("rdrag");
        const move = (m: PointerEvent) => setPanelWidth(panel.getBoundingClientRect().right - m.clientX),
          up = () => {
            grip.removeEventListener("pointermove", move);
            document.body.classList.remove("rdrag");
            try {
              localStorage.setItem(GRIP_KEY, String(Math.round(panel.getBoundingClientRect().width)));
            } catch {
              /* not kept */
            }
          };
        grip.addEventListener("pointermove", move);
        grip.addEventListener("pointerup", up, { once: true });
        grip.addEventListener("pointercancel", up, { once: true });
      }}
      onDoubleClick={() => {
        document.documentElement.style.removeProperty("--rpanel-w");
        try {
          localStorage.removeItem(GRIP_KEY);
        } catch {
          /* nothing kept */
        }
      }}
    />
  );
}
