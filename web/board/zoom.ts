// Pinch, wheel, drag and double-click zoom for a task result image. One box, one image:
// the image fills the box (object-fit: contain) and a transform moves it.
const MIN = 1, MAX = 8;

export function wireZoom(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(".tp-zoom:not([data-zoom])").forEach((box) => {
    const img = box.querySelector<HTMLElement>("img");
    if (!img) return;
    box.dataset.zoom = "1";
    let s = 1, x = 0, y = 0;
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0, moved = false;
    const label = box.querySelector<HTMLElement>("[data-zoom-reset]");
    const apply = () => {
      const w = box.clientWidth, h = box.clientHeight;
      x = Math.min(0, Math.max(w - w * s, x));
      y = Math.min(0, Math.max(h - h * s, y));
      img.style.transform = `translate(${x}px,${y}px) scale(${s})`;
      box.classList.toggle("zoomed", s > 1.001);
      if (label) label.textContent = Math.round(s * 100) + "%";
    };
    // Scale about a point in box coordinates, so what is under the fingers stays there.
    const zoomAt = (px: number, py: number, next: number) => {
      next = Math.min(MAX, Math.max(MIN, next));
      x = px - ((px - x) * next) / s;
      y = py - ((py - y) * next) / s;
      s = next;
      apply();
    };
    const local = (e: { clientX: number; clientY: number }) => {
      const r = box.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const centre = () => {
      const [a, b] = [...pts.values()];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
    };
    box.addEventListener("wheel", (e) => {
      e.preventDefault();
      const p = local(e);
      // A trackpad pinch arrives as a wheel with ctrlKey and small deltas.
      zoomAt(p.x, p.y, s * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
    }, { passive: false });
    box.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      box.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, local(e));
      moved = false;
      if (pts.size === 2) pinch = centre().d;
    });
    box.addEventListener("pointermove", (e) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const now = local(e);
      if (pts.size === 2) {
        const before = centre();
        pts.set(e.pointerId, now);
        const after = centre();
        x += after.x - before.x;
        y += after.y - before.y;
        if (pinch > 0) zoomAt(after.x, after.y, s * (after.d / pinch));
        pinch = after.d;
        moved = true;
      } else if (s > 1) {
        x += now.x - prev.x;
        y += now.y - prev.y;
        pts.set(e.pointerId, now);
        moved = true;
        apply();
      }
    });
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      pinch = 0;
    };
    box.addEventListener("pointerup", up);
    box.addEventListener("pointercancel", up);
    box.addEventListener("dblclick", (e) => {
      if ((e.target as HTMLElement).closest("button") || moved) return;
      const p = local(e);
      if (s > 1) zoomAt(p.x, p.y, 1);
      else zoomAt(p.x, p.y, 2.5);
    });
    box.querySelector("[data-zoom-in]")?.addEventListener("click", () => zoomAt(box.clientWidth / 2, box.clientHeight / 2, s * 1.5));
    box.querySelector("[data-zoom-out]")?.addEventListener("click", () => zoomAt(box.clientWidth / 2, box.clientHeight / 2, s / 1.5));
    label?.addEventListener("click", () => zoomAt(box.clientWidth / 2, box.clientHeight / 2, 1));
    new ResizeObserver(apply).observe(box);
    apply();
  });
}
