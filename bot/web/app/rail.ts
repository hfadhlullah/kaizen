import { $ } from "./dom.ts";

// ---- sidebar width: drag the grip; under SNAP it folds to the avatar rail ----
const RAIL = 72,
  MIN = 220,
  MAX = 480,
  SNAP = 150;
let listW = 290,
  wideW = 290;
function setListW(w, save = true) {
  const rail = w < SNAP;
  listW = rail ? RAIL : Math.min(MAX, Math.max(MIN, Math.round(w)));
  if (!rail) wideW = listW;
  document.body.style.setProperty("--list-w", listW + "px");
  document.body.classList.toggle("rail", rail);
  $("grip").setAttribute("aria-valuenow", listW);
  if (save)
    try {
      localStorage.listW = listW;
    } catch {}
}
const toggleRail = () => setListW(listW === RAIL ? wideW : 0);

export function initRail() {
  {
    const g = $("grip");
    g.addEventListener("pointerdown", (e) => {
      if (e.button) return;
      e.preventDefault();
      g.setPointerCapture(e.pointerId);
      document.body.classList.add("dragging");
    });
    g.addEventListener("pointermove", (e) => {
      if (g.hasPointerCapture(e.pointerId)) setListW(e.clientX - g.parentElement.getBoundingClientRect().left, false);
    });
    g.addEventListener("lostpointercapture", () => {
      document.body.classList.remove("dragging");
      setListW(listW);
    });
    g.addEventListener("dblclick", toggleRail);
    g.addEventListener("keydown", (e) => {
      const step = { ArrowLeft: -20, ArrowRight: 20 }[e.key];
      if (step) setListW(listW === RAIL ? (step > 0 ? MIN : 0) : listW === MIN && step < 0 ? 0 : listW + step);
      else if (e.key === "Enter") toggleRail();
      else return;
      e.preventDefault();
    });
    let saved = 0;
    try {
      saved = +localStorage.listW || 0;
    } catch {}
    setListW(saved || 290, false);
  }
}
