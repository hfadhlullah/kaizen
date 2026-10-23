import { store } from "./store.ts";
import { $, html, ico } from "./dom.ts";
import { load } from "./api.ts";
import { termLoad } from "./agent-term.ts";
import { open } from "./panel.ts";
import { resume } from "./approvals.ts";

// ---- the Terminal page: every in-card agent session the board knows, Ideas to Done, tiled.
// A tile is one more kzTerm mount on /pty beside the card panel's (attachPty takes many
// listeners). Mounts outlive redraws: a /state tick moves tiles around, it never reconnects.
// Layout is per browser in kz-terms: tile order, hidden tiles, the maximised one, and the
// split sizes per grid shape.
// ponytail: a √n grid with draggable borders, not an i3-style split tree; add one if a grid falls short.
// mode: grid (√n), cols (side by side) or rows (stacked, so borders drag up and down).
type Lay = { mode: string; order: string[]; hidden: string[]; max: string | null; sizes: Record<string, { c: number[]; r: number[] }> };
const MODES = [["grid", "Grid"], ["cols", "Side by side"], ["rows", "Stacked"]];
const GAP = 6;
let lay: Lay = { mode: "grid", order: [], hidden: [], max: null, sizes: {} };
try {
  lay = { ...lay, ...JSON.parse(localStorage.getItem("kz-terms") || "{}") };
} catch (e) {}
const save = () => {
  lay.order = lay.order.slice(-100);
  lay.hidden = lay.hidden.slice(-100);
  try {
    localStorage.setItem("kz-terms", JSON.stringify(lay));
  } catch (e) {}
};
// key -> its tile and the function that unmounts its terminal.
const tiles = new Map<string, { el: HTMLElement; off: (() => void) | null }>();
let showing = false;

// The header: run name - project name. A run's name is its id without the date, as card chips name runs.
const nameOf = (c) =>
  c.kind === "run"
    ? String(c.id || c.text).replace(/^\d{4}-\d\d-\d\d-/, "").replace(/-/g, " ")
    : String(c.text).split("\n")[0].slice(0, 80);
const projOf = (c) => String(c.where || "").split(/[\\/]/).filter(Boolean).pop() || c.where || "";
// One card per session; the newest card wins a shared key.
function sessions() {
  const m = new Map();
  for (const c of store.S.cards) if (c.pty && !c.archived) m.set(c.pty.key, c);
  return m;
}

export function termsStop() {
  showing = false;
  for (const t of tiles.values()) t.off?.();
  tiles.clear();
  $("terms").innerHTML = "";
}

export function openTerms() {
  showing = true;
  // A /state tick mid-drag would rebuild the handle being dragged.
  if (document.body.classList.contains("tdrag")) return;
  const box = $("terms"),
    all = sessions();
  for (const [k, t] of tiles)
    if (!all.has(k) || lay.hidden.includes(k)) {
      t.off?.();
      t.el.remove();
      tiles.delete(k);
    }
  const rank = (k) => (lay.order.includes(k) ? lay.order.indexOf(k) : 1e9);
  // Live tiles first, ended ones after; each in the saved order.
  const ended = (k) => (all.get(k).pty.alive ? 0 : 1);
  const keys = [...all.keys()].filter((k) => !lay.hidden.includes(k)).sort((a, b) => ended(a) - ended(b) || rank(a) - rank(b));
  for (const k of keys) if (!lay.order.includes(k)) lay.order.push(k);
  if (lay.max && !keys.includes(lay.max)) lay.max = null;
  let grid = box.querySelector<HTMLElement>(".tgrid"),
    bar = box.querySelector<HTMLElement>(".tbar");
  if (!grid) {
    box.innerHTML = `<div class="tbar"></div><div class="tgrid"></div>`;
    grid = box.querySelector(".tgrid")!;
    bar = box.querySelector(".tbar")!;
  }
  // An ended session closed with × has nothing to come back to: no chip for it.
  const hid = [...all.keys()].filter((k) => lay.hidden.includes(k) && all.get(k).pty.alive);
  bar!.innerHTML = html`<span class="bar" role="group" aria-label="Layout">${MODES.map(([v, l]) => html`<button data-mode="${v}" class="${lay.mode === v ? "on" : ""}" aria-pressed="${String(lay.mode === v)}">${l}</button>`)}</span>${hid.length ? html`<span class="dim">Hidden</span>${hid.map((k) => html`<button class="chip" data-show="${k}" title="Show this terminal">${ico("plus")}${nameOf(all.get(k))} - ${projOf(all.get(k))}</button>`)}` : ""}`.s;
  bar!.querySelectorAll<HTMLElement>("[data-mode]").forEach(
    (b) =>
      (b.onclick = () => {
        lay.mode = b.dataset.mode!;
        lay.max = null;
        save();
        openTerms();
      }),
  );
  bar!.querySelectorAll<HTMLElement>("[data-show]").forEach(
    (b) =>
      (b.onclick = () => {
        lay.hidden = lay.hidden.filter((k) => k !== b.dataset.show);
        save();
        openTerms();
      }),
  );
  grid.querySelector(".tempty")?.remove();
  if (!keys.length) {
    grid.style.cssText = "";
    grid.querySelectorAll(".tsplit").forEach((s) => s.remove());
    grid.insertAdjacentHTML(
      "beforeend",
      html`<div class="empty tempty"><div class="mascot"></div><b>${hid.length ? "Every terminal is hidden" : "No terminals running"}</b><p>Runs started with the agent in its card show here, from Ideas to Done.</p></div>`.s,
    );
    return;
  }
  for (const k of keys) {
    const c = all.get(k);
    let t = tiles.get(k);
    if (!t) {
      const el = document.createElement("section");
      el.className = "tile";
      el.dataset.k = k;
      el.innerHTML = `<header draggable="true"></header><div class="term" aria-label="Agent terminal"></div>`;
      t = { el, off: null };
      tiles.set(k, t);
      mount(k, t);
      wire(el);
    }
    const st = !c.pty.alive ? "ended" : c.pty.asking ? "asking" : "running",
      off = st === "ended";
    const hd = t.el.querySelector("header")!;
    hd.title = (c.kind === "run" ? c.id : c.text) + " · " + c.where;
    // An ended run can be resumed from here; an idea whose agent ended has no run to resume.
    hd.innerHTML = html`<span class="tdot ${st}" role="img" title="${st}" aria-label="${st}"></span><b>${nameOf(c)} - ${projOf(c)}</b>${off ? html`<span class="tend">ended</span>` : ""}<span class="sp"></span>${off && c.kind === "run" ? html`<button class="btn sm" data-a="resume" title="Continue this run's agent">Resume</button>` : ""}<button class="ib sm" data-a="card" title="Open card" aria-label="Open card">${ico("open")}</button><button class="ib sm" data-a="max" title="${lay.max === k ? "Restore" : "Maximise"}" aria-label="${lay.max === k ? "Restore" : "Maximise"}">${ico(lay.max === k ? "min" : "max")}</button><button class="ib sm" data-a="hide" title="${off ? "Close" : "Hide"}" aria-label="${off ? "Close" : "Hide"}">${ico("close")}</button>`.s;
    t.el.classList.toggle("ended", off);
    t.el.classList.toggle("off", !!lay.max && lay.max !== k);
    t.el.style.gridColumn = "";
    grid.append(t.el); // in order
  }
  // Grid is √n, the last tile spanning what its row leaves empty; side by side is one row, stacked one column.
  const n = lay.max ? 1 : keys.length,
    cols = lay.mode === "cols" ? n : lay.mode === "rows" ? 1 : Math.ceil(Math.sqrt(n)),
    rows = Math.ceil(n / cols);
  // The column where the last row's tile starts spanning; borders right of it are not inner ones there.
  let spanFrom = cols;
  if (!lay.max && cols * rows > n) {
    tiles.get(keys[keys.length - 1])!.el.style.gridColumn = `span ${cols * rows - n + 1}`;
    spanFrom = n - (rows - 1) * cols - 1;
  }
  const shape = `${lay.mode}:${cols}x${rows}`,
    sz = lay.sizes[shape];
  const c = sz?.c?.length === cols ? sz.c : Array(cols).fill(1),
    r = sz?.r?.length === rows ? sz.r : Array(rows).fill(1);
  layout(grid, c, r, shape, spanFrom);
}

function mount(k, t) {
  termLoad()
    .then((m) => {
      if (tiles.get(k) !== t) return;
      t.off = m(t.el.querySelector(".term"), k, () => load(true));
    })
    .catch(() => (t.el.querySelector(".term")!.textContent = "The terminal could not load."));
}

function wire(el: HTMLElement) {
  const k = el.dataset.k!;
  el.querySelector("header")!.onclick = (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>("[data-a]")?.dataset.a;
    if (a === "max") lay.max = lay.max === k ? null : k;
    else if (a === "hide") {
      lay.hidden.push(k);
      if (lay.max === k) lay.max = null;
    } else if (a === "card") {
      const c = sessions().get(k);
      if (c) open(c);
      return;
    } else if (a === "resume") {
      const c = sessions().get(k);
      // resume() asks the board to open the card on its new session; here the new tile shows it.
      if (c) resume(c, (e.target as HTMLElement).closest("button")).then(() => (store.wantTerm = null));
      return;
    } else return;
    save();
    openTerms();
  };
  el.querySelector("header")!.ondblclick = (e) => {
    if ((e.target as HTMLElement).closest("button")) return;
    lay.max = lay.max === k ? null : k;
    save();
    openTerms();
  };
  // Drag a header onto another tile: the two swap places.
  el.querySelector("header")!.ondragstart = (e) => {
    e.dataTransfer!.setData("text/kz-term", k);
    e.dataTransfer!.effectAllowed = "move";
  };
  el.ondragover = (e) => {
    if (!e.dataTransfer!.types.includes("text/kz-term")) return;
    e.preventDefault();
    el.classList.add("drop");
  };
  el.ondragleave = () => el.classList.remove("drop");
  el.ondrop = (e) => {
    el.classList.remove("drop");
    const from = e.dataTransfer!.getData("text/kz-term");
    if (!from || from === k) return;
    e.preventDefault();
    const i = lay.order.indexOf(from),
      j = lay.order.indexOf(k);
    if (i < 0 || j < 0) return;
    [lay.order[i], lay.order[j]] = [lay.order[j], lay.order[i]];
    save();
    openTerms();
  };
}

// Track sizes in fr, and a handle on each inner border. A handle's centre is placed in CSS:
// the tracks before it share (100% - gaps) by their fr, plus the gaps before it. A column
// handle stops above the last row where that row's spanning tile covers the border.
const at = (tr: number[], i: number) => {
  const F = tr.reduce((a, b) => a + b, 0),
    S = tr.slice(0, i + 1).reduce((a, b) => a + b, 0);
  return `calc((100% - ${(tr.length - 1) * GAP}px) * ${S / F} + ${i * GAP + GAP / 2}px)`;
};
function layout(grid: HTMLElement, c: number[], r: number[], shape: string, spanFrom: number) {
  grid.querySelectorAll(".tsplit").forEach((s) => s.remove());
  const place = () => {
    grid.style.gridTemplateColumns = c.map((x) => x + "fr").join(" ");
    grid.style.gridTemplateRows = r.map((x) => x + "fr").join(" ");
    grid.querySelectorAll<HTMLElement>(".tsplit").forEach((h) => {
      const i = +h.dataset.i!;
      if (h.dataset.axis === "r") return void (h.style.top = at(r, i));
      h.style.left = at(c, i);
      h.style.bottom = i >= spanFrom ? `calc(100% - ${at(r, r.length - 2)} + ${GAP / 2}px)` : "0px";
    });
  };
  if (!lay.max)
    for (const [axis, tr] of [["c", c], ["r", r]] as const)
      for (let i = 0; i < tr.length - 1; i++) {
        const h = document.createElement("div");
        h.className = "tsplit " + axis;
        h.dataset.axis = axis;
        h.dataset.i = String(i);
        h.setAttribute("role", "separator");
        h.setAttribute("aria-orientation", axis === "c" ? "vertical" : "horizontal");
        h.title = "Drag to resize, double-click to even out";
        drag(h, grid, axis, tr, i, place, () => {
          lay.sizes[shape] = { c: [...c], r: [...r] };
          save();
        });
        grid.append(h);
      }
  place();
}

function drag(h: HTMLElement, grid: HTMLElement, axis: "c" | "r", tr: number[], i: number, place: () => void, keep: () => void) {
  h.ondblclick = () => {
    tr.fill(1);
    keep();
    place();
  };
  h.onpointerdown = (e) => {
    e.preventDefault();
    h.setPointerCapture(e.pointerId);
    document.body.classList.add("tdrag");
    const F = tr.reduce((a, b) => a + b, 0),
      span = (axis === "c" ? grid.clientWidth : grid.clientHeight) - (tr.length - 1) * GAP,
      min = F * 0.1,
      from = axis === "c" ? e.clientX : e.clientY,
      a = tr[i],
      b = tr[i + 1];
    h.onpointermove = (m) => {
      const d = Math.max(min - a, Math.min(b - min, (((axis === "c" ? m.clientX : m.clientY) - from) / span) * F));
      tr[i] = a + d;
      tr[i + 1] = b - d;
      place();
    };
    h.onpointerup = h.onpointercancel = () => {
      h.onpointermove = h.onpointerup = h.onpointercancel = null;
      document.body.classList.remove("tdrag");
      keep();
    };
  };
}

export const termsShowing = () => showing;
