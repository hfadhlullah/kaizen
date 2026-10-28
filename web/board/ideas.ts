// The Ideas page (?view=ideas): every idea and run across projects as one table, with
// source, project, Open/Running/Done and text filters. A card's source is the icebox
// signal it came from (its `idea` text or `run` id); one typed by hand is "Manual".
// The data is the rail's (workspace.ts): no fetch of its own.
import { store } from "./store.ts";
import { $, html, ico, raw } from "./dom.ts";
import { age, NAMES } from "./labels.ts";
import { key, newIdea, render } from "./cards.ts";
import { openWorkspace } from "./run-view.ts";
import { projectPicker } from "./projects.ts";
import { refreshBoardBadge } from "./badge.ts";
import { cardHref, drawSources, logo, railData, srcIcon, stateOf, titleOf } from "./workspace.ts";

const WORDS = { idle: "Idea", plan: "Planning", build: "Building", review: "Reviewing", wait: "Waiting on you", done: "Done", aband: "Abandoned", stalled: "Stalled" };
const PLAT = { x: "X", tiktok: "TikTok", instagram: "Instagram", threads: "Threads" };
const AGENTS = ["claude", "codex", "agy", "opencode", "gemini", "cursor"];
const f = { src: "all", proj: "", show: "open", q: "" };
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
  const fin = (c) => c.status === "done" || c.status === "abandoned";
  const q = f.q.trim().toLowerCase();
  const rows = cards
    .filter((c) => f.src === "all" || src.get(c) === f.src)
    .filter((c) => !f.proj || c.state === f.proj)
    .filter((c) => (f.show === "done" ? fin(c) : f.show === "running" ? c.kind === "run" && !fin(c) : !fin(c)))
    .filter((c) => !q || (titleOf(c) + " " + nameOf(c.state, projects)).toLowerCase().includes(q))
    .sort((a, b) => (b.moved ?? b.added ?? 0) - (a.moved ?? a.added ?? 0));
  const chip = (v, label, icon) => html`<button class="pill${f.src === v ? " on" : ""}" data-src="${v}">${icon}${label}</button>`;
  const now = Date.now();
  const top = html`<div class="ibar">${chip("all", "All", raw('<svg><use href="#r-bulb"/></svg>'))}${present
    .filter(Boolean)
    .map((u) => chip(u, known.get(u) ? srcLabel(known.get(u)) : srcLabel({ url: u }), srcIcon(known.get(u) ?? { url: u })))}${present.includes("") ? chip("", "Manual", ico("pen")) : ""}<div id="ideas-proj"></div></div>`;
  const seg = (v, l) => html`<button class="pill${f.show === v ? " on" : ""}" data-show="${v}">${l}</button>`;
  const bar = html`<div class="ibar">${seg("open", "Open")}${seg("running", "Running")}${seg("done", "Done")}<input type="search" class="sel" id="ideas-q" placeholder="Search titles and projects" aria-label="Search ideas" spellcheck="false" autocomplete="off" value="${f.q}"><button class="ib" id="ideas-add" title="New idea" aria-label="New idea">${ico("plus")}</button><button class="ib" id="ideas-ref" title="Refresh" aria-label="Refresh">${ico("refresh")}</button></div>`;
  const table = html`<table class="itable"><thead><tr><th></th><th>Title / context</th><th>Status</th><th>Updated</th><th></th></tr></thead><tbody>${rows.map((c, i) => {
    const name = nameOf(c.state, projects),
      st = stateOf(c),
      agent = (c.tags ?? []).find((t) => AGENTS.includes(t));
    return html`<tr><td>${logo(c.state, name, projects)}</td><td><b>${titleOf(c)}</b><div class="ctx">${name}${agent ? html`<span class="tag">${NAMES[agent]}</span>` : ""}</div></td><td><span class="stc"><span class="si ${st}"></span>${WORDS[st]}</span></td><td class="d">${c.moved || c.added ? age(c.moved || c.added, now) + " ago" : ""}</td><td><button class="go" data-i="${i}">${c.kind === "idea" ? "Start" : "Open"} ${ico("arrow")}</button></td></tr>`;
  })}</tbody></table>${rows.length ? "" : html`<p class="none">Nothing matches.</p>`}`;
  const had = document.activeElement?.id;
  box.innerHTML = String(html`${top}<div class="ibox">${bar}<div class="iscroll">${table}</div></div>`);
  if (had === "ideas-q") {
    const el = $(had);
    el.focus();
    if (had === "ideas-q") el.setSelectionRange(f.q.length, f.q.length);
  }
  box.querySelectorAll<HTMLElement>("[data-src]").forEach((b) => (b.onclick = () => ((f.src = b.dataset.src!), draw())));
  box.querySelectorAll<HTMLElement>("[data-show]").forEach((b) => (b.onclick = () => ((f.show = b.dataset.show!), draw())));
  projectPicker($("ideas-proj"), dirs.map((d) => ({ dir: d, label: nameOf(d, projects) })), f.proj, (d) => ((f.proj = d), draw()));
  $("ideas-q").oninput = (e) => ((f.q = (e.target as HTMLInputElement).value), draw());
  $("ideas-add").onclick = () => newIdea({ dir: f.proj || null });
  $("ideas-ref").onclick = () => (void drawSources(true), void refreshBoardBadge());
  box.querySelectorAll<HTMLElement>("button.go").forEach((b) => (b.onclick = () => act(rows[+b.dataset.i!])));
}

// Start: the card's own run form on the board (agent pick, then go). Open: the card.
// Cards of a project this board is not showing go through the board's deep link.
function act(c) {
  const here = store.S.cards.find((x) => key(x) === key(c));
  if (!here) {
    location.href = c.kind === "run" ? cardHref(c) + "&all=1" : `/?all=1&dir=${encodeURIComponent(c.state)}&idea=${encodeURIComponent(c.text)}`;
    return;
  }
  if (c.kind === "run") return openWorkspace(here);
  go("board", true);
  store.mode = "run";
  store.modeKey = key(here);
  render();
}

export function openIdeas() {
  void drawSources(true);
  draw();
}
export function initIdeas(goTo: typeof go) {
  go = goTo;
  addEventListener("kz-rail", draw);
}
