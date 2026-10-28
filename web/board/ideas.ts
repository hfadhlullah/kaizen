// The Ideas page (?view=ideas): every idea and run across projects as one table, with
// source, project, Open/Running/Done and text filters. A card's source is the icebox
// signal it came from (its `idea` text or `run` id); one typed by hand is "Manual".
// The data is the rail's (workspace.ts): no fetch of its own.
import { store } from "./store.ts";
import { $, html, ico, raw } from "./dom.ts";
import { age, NAMES } from "./labels.ts";
import { key, runPopup } from "./cards.ts";
import { openWorkspace } from "./run-view.ts";
import { refreshBoardBadge } from "./badge.ts";
import { cardHref, drawSources, logo, railData, srcIcon, stateOf, titleOf } from "./workspace.ts";

const WORDS = { idle: "Idea", plan: "Planning", build: "Building", review: "Reviewing", wait: "Waiting on you", done: "Done", aband: "Abandoned", stalled: "Stalled" };
const PLAT = { x: "X", tiktok: "TikTok", instagram: "Instagram", threads: "Threads" };
const AGENTS = ["claude", "codex", "agy", "opencode", "gemini", "cursor"];
// sort: on Open, ideas first or running first (kept per browser).
const f = { src: "all", proj: "", show: "open", q: "", sort: (() => { try { return localStorage.getItem("kz-ideas-sort") || "runs"; } catch { return "runs"; } })() };
let go: (v: string, push?: boolean) => void = () => {};

const nameOf = (dir, projects) => {
  const l = projects?.find((p) => p.dir === dir)?.label || dir.replace(/[\\/]\.kaizen$/, "");
  return l.split(/[\\/]/).pop() || l;
};
const srcLabel = (s) => s.label || PLAT[s.social] || (() => { try { return new URL(s.url).hostname.replace(/^www\./, ""); } catch { return s.url; } })();

// Each card's source url, or "" for a hand-typed one.
function sourcesOf(cards, d) {
  const sigs = [...(d?.icebox ?? []), ...(d?.dismissed ?? [])];
  const of = new Map<any, string>();
  for (const c of cards) {
    const s = sigs.find((s) => s.dir === c.state && ((c.kind === "run" && s.run === c.id) || (s.idea && (s.idea === c.text || s.idea === c.title))));
    // A hand-added icebox item ("manual") is no outside source either.
    of.set(c, /^https?:\/\//.test(s?.source ?? "") ? s.source : "");
  }
  return of;
}

// Keyboard: the row picked with the arrow keys (from the search box or the page), Enter acts on it.
let sel = 0;
let shownRows: any[] = [];
function draw() {
  const box = $("ideasv");
  if (!document.body.classList.contains("ideav")) return;
  const { cards: all, projects, srcs } = railData();
  const cards = all.filter((c) => !c.archived);
  const src = sourcesOf(cards, srcs);
  const known = new Map<string, any>((srcs?.sources ?? []).map((s) => [s.url, s]));
  const present = [...new Set(cards.map((c) => src.get(c)!))];
  if (f.src !== "all" && !present.includes(f.src)) f.src = "all";
  const dirs = [...new Set(cards.map((c) => c.state))];
  // "Showing": the same projects-shown set as the Board and the Icebox (store.shown).
  const shownDirs = dirs.filter((d) => store.shown.has(d));
  // The Board's header is the Ideas header too (as on the Icebox): its project picker, its
  // Showing list and its search box drive this table.
  const proj = store.all ? "" : store.S?.dir ?? "";
  const q = (($("bq") as HTMLInputElement | null)?.value ?? "").trim().toLowerCase();
  const fin = (c) => c.status === "done" || c.status === "abandoned";
  const rows = cards
    .filter((c) => f.src === "all" || src.get(c) === f.src)
    .filter((c) => (proj ? c.state === proj : !shownDirs.length || shownDirs.includes(c.state)))
    // Open: ideas not started yet and runs in flight. Running: runs in flight only. Done: finished runs.
    .filter((c) => (f.show === "done" ? fin(c) : f.show === "running" ? c.kind === "run" && !fin(c) : !fin(c)))
    .filter((c) => !q || (titleOf(c) + " " + nameOf(c.state, projects)).toLowerCase().includes(q))
    // On Open, ideas above runs or runs above ideas, as chosen; newest first within each.
    .sort((a, b) => (f.show === "open" ? (a.kind === b.kind ? 0 : (a.kind === "idea") === (f.sort === "ideas") ? -1 : 1) : 0) || (b.moved ?? b.added ?? 0) - (a.moved ?? a.added ?? 0));
  const now = Date.now();
  const seg = (v, l) => html`<button class="pill${f.show === v ? " on" : ""}" data-show="${v}">${l}</button>`;
  const srcName = (u) => (u === "all" ? "All sources" : u === "" ? "Manual" : known.get(u) ? srcLabel(known.get(u)) : srcLabel({ url: u }));
  const srcMark = (u) => (u === "all" ? raw('<svg><use href="#r-bulb"/></svg>') : u === "" ? ico("pen") : srcIcon(known.get(u) ?? { url: u }));
  const srcList = ["all", ...present.filter(Boolean), ...(present.includes("") ? [""] : [])];
  // A pop-up picker: a button that opens a short list.
  const pop = (id, label, rows) => html`<details class="combo ipop" id="${id}"><summary class="sel">${label}</summary><div class="menu-pop pick-list">${rows}</div></details>`;
  const ck = raw('<svg class="ck"><use href="#i-check"/></svg>');
  const sources = pop(
    "ideas-src",
    html`${srcMark(f.src)}<span>${srcName(f.src)}</span>`,
    html`${srcList.map((u) => html`<button type="button" role="menuitemradio" data-src="${u}" aria-checked="${String(f.src === u)}">${srcMark(u)}<span>${srcName(u)}</span>${ck}</button>`)}`,
  );
  // Ideas' own filters, placed in the shared header after its search box.
  const sortPop =
    f.show === "open"
      ? pop(
          "ideas-sort",
          html`<span>${f.sort === "ideas" ? "Ideas first" : "Running first"}</span>`,
          html`${[["ideas", "Ideas first"], ["runs", "Running first"]].map(([v, l]) => html`<button type="button" role="menuitemradio" data-sort="${v}" aria-checked="${String(f.sort === v)}"><span>${l}</span>${ck}</button>`)}`,
        )
      : "";
  const extra = html`<span class="iseg">${seg("open", "Open")}${seg("running", "Running")}${seg("done", "Done")}</span>${sortPop}${sources}<button class="ib" id="ideas-ref" title="Refresh" aria-label="Refresh">${ico("refresh")}</button>`;
  const table = html`<table class="itable"><thead><tr><th></th><th>Title / context</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>${rows.map((c, i) => {
    const name = nameOf(c.state, projects),
      st = stateOf(c),
      agent = (c.tags ?? []).find((t) => AGENTS.includes(t));
    return html`<tr><td>${logo(c.state, name, projects)}</td><td><b>${titleOf(c)}</b><div class="ctx">${name}${agent ? html`<span class="tag">${NAMES[agent]}</span>` : ""}</div></td><td><span class="stc"><span class="si ${st}"></span>${WORDS[st]}</span></td><td class="d">${c.moved || c.added ? age(c.moved || c.added, now) + " ago" : ""}</td><td><button class="go" data-i="${i}">${c.kind === "idea" ? "Start" : "Open"} ${ico("arrow")}</button></td></tr>`;
  })}</tbody></table>${rows.length ? "" : html`<p class="none">Nothing matches.</p>`}`;
  const hx = $("hx");
  // Not while a pop-up in it is open: redrawing would close it under the pointer.
  if (!hx.querySelector("details[open]")) hx.innerHTML = String(extra);
  box.innerHTML = String(html`<div class="ibox"><div class="iscroll">${table}</div></div>`);

  hx.querySelectorAll<HTMLElement>("[data-src]").forEach((b) => (b.onclick = () => ((f.src = b.dataset.src!), (hx.innerHTML = ""), draw())));
  hx.querySelectorAll<HTMLElement>("[data-sort]").forEach(
    (b) =>
      (b.onclick = () => {
        f.sort = b.dataset.sort!;
        try {
          localStorage.setItem("kz-ideas-sort", f.sort);
        } catch {}
        hx.innerHTML = "";
        draw();
      }),
  );
  hx.querySelectorAll<HTMLElement>("[data-show]").forEach((b) => (b.onclick = () => ((f.show = b.dataset.show!), (hx.innerHTML = ""), draw())));
  $("ideas-ref").onclick = () => (void drawSources(true), void refreshBoardBadge());
  box.querySelectorAll<HTMLElement>("button.go").forEach((b) => (b.onclick = () => act(rows[+b.dataset.i!])));
  shownRows = rows;
  sel = Math.max(0, Math.min(sel, rows.length - 1));
  mark();
}

// Start: the run form in a popup (agent pick, then go), then the run workspace. Open: the card.
// Cards of a project this board is not showing go through the board's deep link.
function act(c) {
  const here = store.S.cards.find((x) => key(x) === key(c));
  if (!here) {
    location.href = c.kind === "run" ? cardHref(c) + "&all=1" : `/?all=1&dir=${encodeURIComponent(c.state)}&idea=${encodeURIComponent(c.text)}`;
    return;
  }
  if (c.kind === "run") return openWorkspace(here);
  runPopup(here);
}

function mark() {
  const trs = [...document.querySelectorAll<HTMLElement>("#ideasv tbody tr")];
  trs.forEach((tr, i) => tr.classList.toggle("kb", i === sel));
  trs[sel]?.scrollIntoView({ block: "nearest" });
}
addEventListener("keydown", (e) => {
  if (!document.body.classList.contains("ideav") || !shownRows.length) return;
  const t = e.target as HTMLElement;
  // From the search box, or anywhere on the page that is not another field or a menu.
  if (t.id !== "bq" && (t.closest("input,textarea,select,[contenteditable],details,dialog") || t.isContentEditable)) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    sel = Math.max(0, Math.min(shownRows.length - 1, sel + (e.key === "ArrowDown" ? 1 : -1)));
    mark();
  } else if (e.key === "Enter" && !e.isComposing) {
    e.preventDefault();
    act(shownRows[sel]);
  }
});
export function openIdeas() {
  $("bq").placeholder = "Search ideas (press /)";
  addEventListener("kz-view", () => ($("bq").placeholder = "Filter cards (press /)"), { once: true });
  void drawSources(true);
  draw();
}
export function initIdeas(goTo: typeof go) {
  go = goTo;
  addEventListener("kz-rail", draw);
  // The shared header's search box, project picker and Showing list.
  addEventListener("kz-state", draw);
  $("bq")?.addEventListener("input", () => ((sel = 0), draw()));
  $("shows")?.addEventListener("click", () => queueMicrotask(draw));
}

// A click outside the Ideas header's pop-ups closes them.
addEventListener(
  "pointerdown",
  (e) => {
    if (!(e.target as Element).closest?.("details.ipop")) document.querySelectorAll<HTMLDetailsElement>("details.ipop[open]").forEach((d) => (d.open = false));
  },
  true,
);
