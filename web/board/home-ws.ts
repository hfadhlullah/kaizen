// The floating Home workspace: agents and shells in kaizen's own folder (~/.kaizen/home), so
// you can talk to an agent before choosing a project. A panel over every view of the board;
// minimized, it waits as a "Home" row at the top of the Projects list, its terminals still
// running. Ctrl+Alt+A or the button at the bottom right toggles it. The server places these
// terminals itself (POST /shell with home: true); the page never names a folder.
import { $, html, ico, raw } from "./dom.ts";
import { store } from "./store.ts";
import { termLoad } from "./agent-term.ts";
import { toast } from "./toast.ts";
import { isPhone } from "./phone.ts";
import { isHomeDir } from "./workspace.ts";

type St = "open" | "min" | "closed";
const KEY = "kz-home-ws";
let st: St = "closed";
let max = false;
let on = ""; // the tab shown
let mounted = "", off: (() => void) | null = null;
let agents: { cmd: string; name: string }[] = [], dflt = "", agentsRead = false;
const MARKS = ["claude", "codex", "gemini"];

// Terminals asked to exit: the server lists them for up to 5 s more (an agent gets its /exit first), never as tabs again.
const ending = new Set<string>();
const tabs = () => (store.shells as any[]).filter((s) => s.run === "home" && !ending.has(s.key));
function save() {
  try { localStorage.setItem(KEY, st); } catch { /* the state lasts this page only */ }
}
function set(s: St) {
  st = s;
  save();
  draw();
}

async function readAgents() {
  if (agentsRead) return;
  try {
    const r = await (await fetch("/agents?home=1")).json();
    agents = r.agents ?? [];
    dflt = r.default ?? "";
    agentsRead = true;
  } catch { /* the menu offers Shell alone */ }
}
async function refresh() {
  try { store.shells = await (await fetch("/shells")).json(); } catch {}
  draw();
}

// No `yolo`: the server applies that agent's saved bypass setting, as a run workspace's + does by default.
async function start(agent?: string, yolo?: boolean) {
  const r = await fetch("/shell", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ home: true, ...(agent ? { agent, ...(yolo ? { yolo } : {}) } : {}) }) }).catch(() => null);
  if (!r?.ok) {
    let why = "";
    try { why = (await r!.json()).error; } catch {}
    toast(why ? "No new terminal: " + why : "No new terminal" + (r ? ` (${r.status})` : ""));
    return draw();
  }
  const sh = await r.json();
  store.shells = [...store.shells.filter((x: any) => x.key !== sh.key), sh];
  on = sh.key;
  draw();
}
// An empty workspace that opens starts the default agent, as an empty run workspace does.
async function startDefault() {
  await readAgents();
  const a = agents.find((x) => x.cmd === dflt) ?? agents[0];
  await start(a?.cmd);
}
const exit = (key: string) => (ending.add(key), fetch("/pty/exit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) }).catch(() => null));
async function closeTab(key: string) {
  await exit(key);
  if (on === key) on = "";
  draw();
}
// × ends the workspace: its terminals are asked to exit, after a yes when some are running.
async function closeAll() {
  const ts = tabs();
  if (ts.length && !confirm(`End ${ts.length} Home terminal${ts.length === 1 ? "" : "s"}?`)) return;
  await Promise.all(ts.map((t) => exit(t.key)));
  on = "";
  set("closed");
}

export function toggleHome() {
  if (st === "open") return set("min");
  set("open");
  // The list may not be read yet (just after a page load): ask before starting a second agent.
  if (!tabs().length) void refresh().then(() => !tabs().length && startDefault());
}

function unmount() {
  off?.();
  off = null;
  mounted = "";
}
async function mount(key: string) {
  if (mounted === key) return;
  unmount();
  mounted = key;
  const body = $("hwsb");
  body.innerHTML = "";
  let kz: any;
  try { kz = await termLoad(); } catch { body.textContent = "The terminal could not load."; return; }
  if (mounted !== key) return;
  const el = document.createElement("div");
  el.className = "term";
  body.append(el);
  off = kz(el, key, () => void refresh());
  requestAnimationFrame(() => el.querySelector<HTMLElement>(".xterm-helper-textarea")?.focus({ preventScroll: true }));
}

// Markup is written only when it changed: an open menu or a hovered tab is left alone on each tick.
const put = (id: string, s: string) => { const el = $(id); if (el.dataset.html !== s) (el.innerHTML = s), (el.dataset.html = s); };
function draw() {
  const p = $("hws"), btn = $("hwsbtn"), row = $("hwsrow");
  if (!p) return;
  const ts = tabs();
  if (!ts.some((t) => t.key === on)) on = ts[ts.length - 1]?.key ?? "";
  p.hidden = st !== "open";
  p.classList.toggle("max", max);
  btn.hidden = st === "open";
  row.hidden = st !== "min";
  row.querySelector(".c")!.textContent = ts.length ? String(ts.length) : "";
  if (st !== "open") return unmount();
  const mark = (a) => (MARKS.includes(a.cmd) ? raw(`<svg><use href="#i-${a.cmd}"/></svg>`) : ico("ai"));
  const tabIco = (t) => (t.agent && MARKS.includes(t.agent) ? raw(`<svg><use href="#i-${t.agent}"/></svg>`) : ico("term"));
  put("hwstabs", String(
    html`${ts.map((t) => html`<button class="hwstab${t.key === on ? " on" : ""}" data-k="${t.key}" title="${t.title}">${tabIco(t)}<span>${t.title}</span><i data-x="${t.key}" role="button" aria-label="Close ${t.title}" title="Close tab">×</i></button>`)}`,
  ));
  put("hwsmenu", String(
    html`${agents.map((a) => html`<button data-n="${a.cmd}">${mark(a)}<span>${a.name}<small>${a.cmd === dflt ? "default agent, in your Home folder" : "in your Home folder"}</small></span></button>`)}${agents.length ? raw("<hr>") : ""}<button data-n="">${ico("term")}<span>Shell<small>a terminal in your Home folder</small></span></button>`,
  ));
  const mx = $("hwsmax");
  mx.title = max ? "Restore size" : "Maximize";
  mx.setAttribute("aria-label", mx.title);
  if (on) void mount(on);
  else {
    unmount();
    $("hwsb").innerHTML = `<p class="hwsempty">No terminals. Start an agent or a shell with +.</p>`;
  }
}

// The panel (by its header, not its buttons) and the button drag anywhere in the window; each spot
// is kept per browser. A press that moved more than 4 px is a drag, so the button's click is skipped.
let dragged = false;
function drag(el: HTMLElement, handle: HTMLElement, key: string, skip: (e: PointerEvent) => boolean) {
  const place = (x: number, y: number, w: number) => {
    el.style.left = Math.max(0, Math.min(innerWidth - w, x)) + "px";
    el.style.top = Math.max(0, Math.min(innerHeight - 40, y)) + "px";
    el.style.right = el.style.bottom = "auto";
  };
  try {
    const at = JSON.parse(localStorage.getItem(key) ?? "null");
    if (Number.isFinite(at?.x) && Number.isFinite(at?.y)) place(at.x, at.y, 40);
  } catch {}
  handle.addEventListener("pointerdown", (e) => {
    if (e.button || skip(e)) return;
    const r = el.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    dragged = false;
    const move = (m: PointerEvent) => {
      if (!dragged && Math.hypot(m.clientX - e.clientX, m.clientY - e.clientY) < 4) return;
      dragged = true;
      place(m.clientX - dx, m.clientY - dy, r.width);
    };
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      if (dragged) try { localStorage.setItem(key, JSON.stringify({ x: parseFloat(el.style.left), y: parseFloat(el.style.top) })); } catch {}
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  });
}

// Search, the resource monitor and the phone's Agents list open a terminal by kz-open-term: a Home one
// opens in this panel (full screen on a phone). Registered at import, so ahead of the run view's
// listener (initRunView), which would open a workspace view that does not exist for it.
if (typeof window !== "undefined")
  addEventListener("kz-open-term", (e: any) => {
    if (!isHomeDir(e.detail?.dir)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!$("hws")) return void (location.href = "/?view=terminal");
    on = String(e.detail.key ?? "");
    st = "open";
    if (!isPhone()) save(); // a phone opens Home only when asked, never on the next page load
    void refresh();
  });

export function initHomeWs() {
  if (!$("plist")) return;
  // A phone shows Home full screen, only when asked: it never opens by itself on a page load.
  try { const v = localStorage.getItem(KEY); if (!isPhone() && (v === "open" || v === "min")) st = v; } catch {}
  // Sent here by wsHref() for a Home terminal (Search on the notebook or video page).
  const q = new URLSearchParams(location.search);
  if (q.has("homews")) {
    q.delete("homews");
    history.replaceState(history.state, "", "/?" + q);
    st = "open";
    if (!isPhone()) save();
  }
  document.body.insertAdjacentHTML(
    "beforeend",
    `<section id="hws" class="hws" role="dialog" aria-label="Home workspace" hidden><header class="hwsh"><svg class="hwsico" aria-hidden="true"><use href="#i-home"/></svg><b>Home</b><div class="hwstabs" id="hwstabs"></div><details class="radd" id="hwsadd"><summary class="ib xs" title="New tab" aria-label="New tab"><svg><use href="#i-plus"/></svg></summary><div class="menu-pop" id="hwsmenu"></div></details><span class="sp"></span><button class="ib xs" id="hwsmin" title="Minimize to the sidebar" aria-label="Minimize to the sidebar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button><button class="ib xs" id="hwsmax" title="Maximize" aria-label="Maximize"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/></svg></button><button class="ib xs" id="hwsx" title="Close: end Home terminals" aria-label="Close the Home workspace"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></header><div class="hwsb" id="hwsb"></div></section><button id="hwsbtn" class="hwsbtn" title="Home workspace (Ctrl+Alt+A)" aria-label="Home workspace"><svg aria-hidden="true"><use href="#r-term"/></svg></button>`,
  );
  // The minimized row: first in the Projects list, beside the list rather than in it, so the list's redraws never drop it.
  $("plist").insertAdjacentHTML(
    "beforebegin",
    `<div class="plist hwsslot" id="hwsrow" hidden><div class="pgrp"><button type="button" class="proj" id="hwsopen" title="Home workspace: agents outside any project (Ctrl+Alt+A)"><svg class="plogo hwsico" aria-hidden="true"><use href="#i-home"/></svg><span class="pname">Home</span><span class="c"></span></button><button type="button" class="wadd hwsrx" id="hwsrx" title="Close the Home workspace" aria-label="Close the Home workspace"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div></div>`,
  );
  const p = $("hws");
  drag(p, p.querySelector<HTMLElement>(".hwsh")!, "kz-home-ws-at", (e) => isPhone() || max || !!(e.target as Element).closest("button,summary,.menu-pop"));
  drag($("hwsbtn"), $("hwsbtn"), "kz-home-ws-btn", () => false);
  $("hwsbtn").onclick = () => (dragged ? (dragged = false) : toggleHome());
  $("hwsopen").onclick = () => set("open");
  $("hwsrx").onclick = () => void closeAll();
  // On a phone × goes back and leaves the agents running (a tab's × ends one); on a computer it ends them all.
  $("hwsx").onclick = () => (isPhone() ? ((st = "closed"), draw()) : void closeAll());
  // The phone's New sheet starts an agent or a shell here ("Home — no project").
  addEventListener("kz-home-start", (e: any) => {
    st = "open";
    if (!isPhone()) save();
    draw();
    void start(e.detail?.agent || undefined, !!e.detail?.yolo);
  });
  $("hwsmin").onclick = () => set("min");
  $("hwsmax").onclick = () => ((max = !max), draw());
  const add = $("hwsadd") as HTMLDetailsElement;
  add.ontoggle = () => {
    if (!add.open) return;
    void readAgents().then(() => {
      draw();
      const m = $("hwsmenu"), r = add.querySelector("summary")!.getBoundingClientRect();
      m.style.top = r.bottom + 4 + "px";
      m.style.left = Math.max(4, Math.min(r.left, innerWidth - m.offsetWidth - 4)) + "px";
    });
  };
  addEventListener("click", (e) => { if (add.open && !add.contains(e.target as Node)) add.open = false; });
  $("hwsmenu").onclick = (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-n]");
    if (!b) return;
    add.open = false;
    void start(agents.find((x) => x.cmd === b.dataset.n)?.cmd);
  };
  $("hwstabs").onclick = (e) => {
    const t = e.target as Element, x = t.closest<HTMLElement>("[data-x]")?.dataset.x;
    if (x) return void closeTab(x);
    const k = t.closest<HTMLElement>("[data-k]")?.dataset.k;
    if (k && k !== on) ((on = k), draw());
  };
  // Read in capture, before a focused terminal sends the keys to its agent.
  addEventListener(
    "keydown",
    (e) => {
      // AltGr reads as Ctrl+Alt on Windows: AltGr+A types a letter (ą) on some layouts, so it is left alone.
      if (!e.ctrlKey || !e.altKey || e.shiftKey || e.metaKey || e.code !== "KeyA" || e.getModifierState?.("AltGraph") || isPhone()) return;
      e.preventDefault();
      e.stopPropagation();
      toggleHome();
    },
    true,
  );
  addEventListener("kz-shells", draw);
  draw();
  if (st === "open") void refresh().then(() => !tabs().length && startDefault());
}
