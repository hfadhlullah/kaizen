import { store } from "./store.ts";
import { $, html, ico } from "./dom.ts";
import { load, post } from "./api.ts";
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
const MODES = [["grid", "Grid", "lgrid"], ["cols", "Side by side", "lcols"], ["rows", "Stacked", "lrows"]];
const GAP = 1;
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
// A phone shows one terminal at a time, picked from tabs: stacked, each terminal took every
// swipe and the page could only be scrolled by its thin headers. The pick is per visit.
// Made on first show, so importing this module needs no window.
let phone: MediaQueryList | null = null,
  pick: string | null = null;

// The header: run name - project name. A run's name is its id without the date, as card chips name runs.
const nameOf = (c) =>
  c.kind === "run"
    ? String(c.id || c.text).replace(/^\d{4}-\d\d-\d\d-/, "").replace(/-/g, " ")
    : String(c.text).split("\n")[0].slice(0, 80);
const tst = (c) => (!c.pty.alive ? "ended" : c.pty.asking ? "asking" : "running");
const projOf = (c) => String(c.where || "").split(/[\\/]/).filter(Boolean).pop() || c.where || "";
// One card per session; the newest card wins a shared key.
function sessions() {
  const m = new Map();
  for (const c of store.S.cards) if (c.pty && !c.archived) m.set(c.pty.key, c);
  // Shells and bare agent sessions a run workspace opened (POST /shell): a tile each too.
  for (const s of store.shells) m.set(s.key, { kind: "shell", text: s.title, where: s.dir.replace(/[\\/]\.kaizen$/, ""), state: s.dir, pty: { key: s.key, alive: true, asking: false } });
  return m;
}

// The side menu's Terminal entry counts the tiles hidden here (the Hidden bar's chips), on every page.
export function termsBadge() {
  const all = sessions();
  const n = lay.hidden.filter((k) => all.get(k)?.pty.alive).length;
  const a = document.querySelector<HTMLElement>('.rail a[data-view="terminal"]');
  if (!a) return;
  if (n) a.dataset.n = String(n);
  else delete a.dataset.n;
  a.title = "Terminal: every agent running in its card" + (n ? ` (${n} hidden)` : "");
}

export function termsStop() {
  showing = false;
  document.body.classList.remove("tmax");
  for (const t of tiles.values()) t.off?.();
  tiles.clear();
  $("terms").innerHTML = "";
}

// A header button took focus off the terminal; give it back so typing carries on.
const focusTerm = (k: string) => tiles.get(k)?.el.querySelector<HTMLElement>(".xterm-helper-textarea")?.focus({ preventScroll: true });
// Ctrl+Shift+M maximises or restores the tile being typed in. Escape belongs to the agent,
// so the key is read in capture, before xterm sends it on.
// The footer's /shells read changed the shell list.
if (typeof window !== "undefined") addEventListener("kz-shells", () => showing && openTerms());
if (typeof window !== "undefined") addEventListener(
  "keydown",
  (e) => {
    if (!showing || !e.ctrlKey || !e.shiftKey || e.altKey || e.metaKey || e.code !== "KeyM" || phone?.matches) return;
    const k = (e.target as HTMLElement).closest?.<HTMLElement>(".tile")?.dataset.k || lay.max;
    if (!k) return;
    e.preventDefault();
    e.stopPropagation();
    lay.max = lay.max === k ? null : k;
    save();
    openTerms();
    focusTerm(k);
  },
  true,
);
// Alt+1…9 goes to the Nth tile; where one tile shows (maximised, or a phone's tabs) it switches
// which. Read by code, so the layout and Alt's own characters do not matter. Alt+arrows stay the shell's word jump.
if (typeof window !== "undefined") addEventListener(
  "keydown",
  (e) => {
    const n = /^Digit([1-9])$/.exec(e.code)?.[1];
    if (!showing || !n || !e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return;
    const k = [...$("terms").querySelectorAll<HTMLElement>(".tile")][+n - 1]?.dataset.k;
    if (!k) return;
    e.preventDefault();
    e.stopPropagation();
    if (phone?.matches) pick = k;
    else if (lay.max && lay.max !== k) {
      lay.max = k;
      save();
    }
    openTerms();
    focusTerm(k);
  },
  true,
);

export function openTerms() {
  showing = true;
  if (!phone) (phone = matchMedia("(max-width:640px)")).onchange = () => showing && openTerms();
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
  // The one tile showing: on a phone the tab picked (the first by default), else the maximised one.
  const one = phone.matches ? (pick && keys.includes(pick) ? pick : keys[0]) : lay.max;
  let grid = box.querySelector<HTMLElement>(".tgrid"),
    bar = box.querySelector<HTMLElement>(".tbar");
  if (!grid) {
    box.innerHTML = `<div class="tbar"></div><div class="tgrid"></div>`;
    grid = box.querySelector(".tgrid")!;
    bar = box.querySelector(".tbar")!;
  }
  // An ended session closed with × has nothing to come back to: no chip for it.
  const hid = [...all.keys()].filter((k) => lay.hidden.includes(k) && all.get(k).pty.alive);
  // The layout switch sits at the right of the page header.
  $("tmodes").innerHTML = html`${MODES.map(([v, l, i]) => html`<button data-mode="${v}" class="${lay.mode === v ? "on" : ""}" aria-pressed="${String(lay.mode === v)}" title="${l}" aria-label="${l}">${ico(i)}</button>`)}`.s;
  bar!.innerHTML = html`${hid.length ? html`<span class="dim">Hidden</span>${hid.map((k) => html`<button class="chip" data-show="${k}" title="Show this terminal">${ico("plus")}${nameOf(all.get(k))} - ${projOf(all.get(k))}</button>`)}` : ""}${phone.matches && keys.length > 1 ? html`<span class="ttabs" role="group" aria-label="Terminals">${keys.map((k) => html`<button class="${k === one ? "on" : ""}" data-pick="${k}" aria-pressed="${String(k === one)}"><span class="tdot ${tst(all.get(k))}"></span>${nameOf(all.get(k))} - ${projOf(all.get(k))}</button>`)}</span>` : ""}`.s;
  termsBadge();
  bar!.querySelectorAll<HTMLElement>("[data-pick]").forEach(
    (b) =>
      (b.onclick = () => {
        pick = b.dataset.pick!;
        openTerms();
      }),
  );
  bar!.querySelector(".ttabs .on")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  $("tmodes").querySelectorAll<HTMLElement>("[data-mode]").forEach(
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
  const had = document.activeElement;
  let i = 0;
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
    const st = tst(c),
      off = st === "ended";
    const hd = t.el.querySelector("header")!;
    hd.title = (c.kind === "run" ? c.id : c.text) + " · " + c.where + (i < 9 ? ` · Alt+${i + 1}` : "");
    // An ended run can be resumed from here; an idea whose agent ended has no run to resume.
    hd.innerHTML = html`<span class="tdot ${st}" role="img" title="${st}" aria-label="${st}"></span><b>${nameOf(c)} - ${projOf(c)}</b>${off ? html`<span class="tend">ended</span>` : ""}<span class="sp"></span>${off && c.kind === "run" ? html`<button class="btn sm" data-a="resume" title="Continue this run's agent">Resume</button>` : ""}${c.kind === "shell" ? "" : html`<button class="ib sm" data-a="card" title="Open card" aria-label="Open card">${ico("open")}</button>`}<button class="ib sm" data-a="max" title="${lay.max === k ? "Restore" : "Maximise"} (Ctrl+Shift+M)" aria-label="${lay.max === k ? "Restore" : "Maximise"}">${ico(lay.max === k ? "min" : "max")}</button>${off ? "" : html`<button class="ib sm" data-a="hide" title="Hide" aria-label="Hide">${ico("dash")}</button>`}<button class="ib sm" data-a="${off ? "hide" : "exit"}" title="${off ? "Close" : "Exit session"}" aria-label="${off ? "Close" : "Exit session"}">${ico("close")}</button>`.s;
    t.el.classList.toggle("ended", off);
    t.el.classList.toggle("asking", st === "asking");
    t.el.classList.toggle("off", !!one && one !== k);
    t.el.classList.toggle("max", !phone.matches && lay.max === k);
    t.el.style.gridColumn = "";
    // In order, moving only what is out of place: a moved tile loses its terminal's focus,
    // and every /state tick came here, so typed keys fell to the page (Firefox's find bar).
    if (grid.children[i] !== t.el) grid.insertBefore(t.el, grid.children[i] || null);
    i++;
  }
  if (had instanceof HTMLElement && had !== document.activeElement && had.isConnected) had.focus({ preventScroll: true });
  // Maximised fills the window, over the sidebar and header: with one terminal it was already the whole grid.
  document.body.classList.toggle("tmax", !!lay.max && !phone.matches);
  // Grid is √n, the last tile spanning what its row leaves empty; side by side is one row, stacked one column.
  const n = one ? 1 : keys.length,
    cols = lay.mode === "cols" ? n : lay.mode === "rows" ? 1 : Math.ceil(Math.sqrt(n)),
    rows = Math.ceil(n / cols);
  // The column where the last row's tile starts spanning; borders right of it are not inner ones there.
  let spanFrom = cols;
  if (!one && cols * rows > n) {
    tiles.get(keys[keys.length - 1])!.el.style.gridColumn = `span ${cols * rows - n + 1}`;
    spanFrom = n - (rows - 1) * cols - 1;
  }
  const shape = `${lay.mode}:${cols}x${rows}`,
    sz = lay.sizes[shape];
  const c = sz?.c?.length === cols ? sz.c : Array(cols).fill(1),
    r = sz?.r?.length === rows ? sz.r : Array(rows).fill(1);
  layout(grid, c, r, shape, spanFrom, !one);
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
    } else if (a === "exit") {
      // The tile stays, turning "ended" with its Resume button when the agent is gone.
      if (confirm("End this agent session? A run can be resumed from its tile or card.")) post("/pty/exit", { key: k }).then(() => load(true));
      return;
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
    focusTerm(k);
  };
  el.querySelector("header")!.ondblclick = (e) => {
    // A phone shows one tile anyway: a double-tap there would only leave desktop maximised.
    if ((e.target as HTMLElement).closest("button") || phone?.matches) return;
    lay.max = lay.max === k ? null : k;
    save();
    openTerms();
    focusTerm(k);
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
export function layout(grid: HTMLElement, c: number[], r: number[], shape: string, spanFrom: number, splits: boolean) {
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
  if (splits)
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
