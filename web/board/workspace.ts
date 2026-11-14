// The side menu's live parts on every page (board, notebook, video): the Icebox count, the Tasks entry's source icons and
// the feed of the Projects list; and the board's flat footer (agent usage, terminal count, phone). The list itself is
// React (components/rail, state in lib/rail): this file reads the cards and hands them over, to the board's own store or,
// on the Notebook, to the kit's (`connectRail`). Stands alone, so the notebook and video bundles can carry it without the board.
import { onBoardCards, attentionTasks, setTaskAttention, taskForCard } from "./badge.ts";
import { store } from "./store.ts";
import { $, html, raw } from "./dom.ts";
import { age, need } from "./labels.ts";
import { openAdd, type AddOpts } from "@lib/project/add-project.ts";
import { projName as ruleProjName, RANK as RULE_RANK, stateOf as ruleStateOf, wsLabel as ruleWsLabel, wsOfCard as ruleWsOfCard, type RailData } from "@lib/rail/rules.ts";
import type { Agent } from "@lib/rail/agents.ts";
import { initSearch, leave } from "./search.ts";
import { dueWord, gitDue } from "./ws-tabs.ts";
import { setToaster, toast } from "./toast.ts";
import { kitHere, loadKit } from "../notebook/kit-loader.ts";

const STAGE = ["idea", "planning", "building", "reviewing", "done"];
// A card's state icon (.si) and the word under its title.
export const stateOf = (c) => ruleStateOf(c, taskForCard(c));
export function subline(c, now) {
  const task = taskForCard(c);
  if (task) return task.attention.reason + " · " + task.attention.action;
  // An idle agent and no run yet: it answered, or waits for the user.
  if (c.kind === "idea") return !c.pty?.alive ? "idea" : c.pty.asking ? "waiting on you" : c.pty.busy ? "planning · starting" : "agent · open";
  const t = c.moved ?? now;
  if (c.stage === "explore") return c.awaiting ? `exploring · ${need(c.awaiting)}` : `exploring · ${age(c.moved ?? now, now)}`;
  if (c.status === "waiting") return c.awaiting ? `${STAGE[c.column] ?? "waiting"} · ${need(c.awaiting)}` : "waiting on you";
  if (c.accept === "needs") return "done, not approved";
  if (gitDue(c)) return `waiting on you · ${dueWord(c)}`;
  if (c.accept === "auto") return `auto-accepted · ${age(t, now)} ago`;
  if (c.status === "done" || c.status === "abandoned") return `${c.status} · ${age(t, now)} ago`;
  if (c.status === "stalled") return `stalled · ${age(t, now)}`;
  return `${STAGE[c.column] ?? c.status} · ${age(t, now)}`;
}
export const titleOf = (c) => (c.title || c.text || "").split("\n")[0];
export const projName = ruleProjName;
export const logo = (dir, name, projects) => {
  const ini = html`<span class="plogo" aria-hidden="true">${(name || "?").charAt(0).toUpperCase()}</span>`;
  return projects?.some((p) => p.dir === dir && p.logo)
    ? html`<img class="plogo" src="/project-logo?dir=${encodeURIComponent(dir)}" alt="" loading="lazy" onerror="this.outerHTML=this.dataset.f" data-f="${String(ini)}">`
    : ini;
};
// A card's address: its run workspace (?view=run&dir=&id=, or &idea= for a task).
export const cardHref = (c) =>
  `/?view=run&dir=${encodeURIComponent(c.state)}&` + (c.kind === "run" ? "id=" + encodeURIComponent(c.id) : "idea=" + encodeURIComponent(c.text));

let last: { cards: any[]; projects?: any[]; agents?: Agent[] } = { cards: [] };
// Where the Projects list lives: the board registers its own store, the Notebook page the loaded kit's.
export type RailApi = { set(d: RailData): void; touch(): void };
let R: RailApi | null = null;
const feed = () => R?.set({ cards: last.cards, projects: last.projects ?? [], agents: last.agents ?? [], tasks: attentionTasks });
export function connectRail(api: RailApi) {
  R = api;
  feed();
}
// Projects that are git repositories (the main checkout has a branch): where a workspace can be made.
export const gitProjects = () =>
  (last.projects ?? []).filter((p) => p.workspaces?.some((w) => w.branch)).map((p) => ({ dir: p.dir as string, name: projName(p.dir, last.projects) }));
// The Projects list, the sheet and the right-click menu are React. The board mounts them (react-mount.ts); the Notebook page
// loads the same components as a bundle (notebook/kit-loader.ts) when it starts and opens them in place. If that fails, or on
// Video, the + button sends the person to the board with the sheet asked for (?add=), as Search does, and Video lists no
// projects.
const onBoard = () => !!document.getElementById("kz-portal");
// The kit for this page, with what only this page knows handed over: where a new workspace opens, the Projects list, and
// a way to leave that writes the open note first. The toast and question of the old code then show through the kit too.
export async function kitFor() {
  const k = await loadKit();
  setToaster(k.toast);
  k.setHost({
    gitProjects,
    wsHref,
    navigate: leave,
    // The Notebook keeps its own project choice: pick it for the board too, then reload onto it.
    pickProject: async (dir: string) => {
      await fetch("/cd", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dir }) }).catch(() => null);
      try {
        localStorage.setItem("kz-proj", dir);
      } catch {}
      leave("/notebook?dir=" + encodeURIComponent(dir));
    },
  });
  return k;
}
function addProject(o: AddOpts) {
  if (onBoard()) return openAdd(o);
  const q = new URLSearchParams({ view: "board", add: o.start ?? "1" });
  if (o.dir) q.set("adddir", o.dir);
  kitFor().then((k) => k.openAdd(o), () => leave("/?" + q));
}
// Arriving from the notebook or Video with the sheet asked for.
function openAsked() {
  const q = new URLSearchParams(location.search),
    add = q.get("add");
  if (!add || !onBoard()) return;
  const dir = q.get("adddir");
  q.delete("add");
  q.delete("adddir");
  history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash);
  setTimeout(() => openAdd({ dir, ...(add === "ws" || add === "folder" || add === "clone" || add === "create" ? { start: add } : {}) }), 400);
}
// A card's workspace row (lib/rail/rules.ts), by the projects the last refresh listed.
export const wsOfCard = (c, projects = last.projects) => ruleWsOfCard(c, projects);
// The floating Home workspace's folder (~/.kaizen/home): never a project's `.kaizen` state dir, and it has no workspace view.
export const isHomeDir = (d: unknown) => typeof d === "string" && /[\\/]\.kaizen[\\/]home$/.test(d);
// A Home terminal's address opens the board with its panel (web/board/home-ws.ts), from any page.
export const wsHref = (dir, ws) => (isHomeDir(dir) ? "/?view=board&homews=1" : `/?view=ws&dir=${encodeURIComponent(dir)}&ws=${encodeURIComponent(ws)}`);
export const RANK = RULE_RANK;
export const wsLabel = ruleWsLabel;
let tasksReadAt = 0, tasksReading = false;
async function readTaskAttention() {
  if (tasksReading || Date.now() - tasksReadAt < 2000) return;
  tasksReading = true; tasksReadAt = Date.now();
  try { const r = await fetch("/tasks?all=1"); if (r.ok) { const body = await r.json(); setTaskAttention(body.tasks ?? []); } } catch { /* retain the latest persisted projection */ }
  finally { tasksReading = false; }
}
// The rail React list lights the row the address names: opening a card in place changes the address without a refresh.
export const markCurrent = () => R?.touch();
addEventListener("popstate", markCurrent);

// What the Tasks page reads too: the cards, and /sources (sources plus every icebox signal).
let srcs: any = null;
export const railData = () => ({ ...last, srcs });
const told = () => dispatchEvent(new Event("kz-rail"));
let srcAt = 0;
export async function drawSources(force = false) {
  if (!force && Date.now() - srcAt < 30_000) return;
  srcAt = Date.now();
  try {
    const r = await fetch("/sources");
    if (!r.ok) return;
    const d = (srcs = await r.json());
    told();
    const n = (d.icebox ?? []).filter((s) => s.status === "new" && !s.asleep).length;
    $("ice-n").textContent = n ? String(n) : "";
    $("rail-srcs").innerHTML = (d.sources ?? [])
      .slice(0, 3)
      .map((s) => String(srcIcon(s)))
      .join("");
  } catch {
    /* offline: keep what shows */
  }
}
// A source's mark: a social platform's sprite, a sheet's grid, else the site's favicon.
export const srcIcon = (s) => {
  if (s.social) return html`<svg aria-hidden="true"><use href="#i-b-${s.social}"/></svg>`;
  if (/docs\.google\.com\/spreadsheets|\.(csv|tsv)$/.test(s.url)) return raw(`<svg aria-hidden="true"><use href="#i-sheet"/></svg>`);
  try {
    return html`<img src="${new URL(s.url).origin}/favicon.ico" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">`;
  } catch {
    return raw("");
  }
};

// Rows are redrawn on every refresh, which restarts a CSS animation from 0deg: the state
// icons jumped back mid-turn. Pinning each to the page clock's origin keeps them in phase
// (the si-* animations have no delay for this to cancel).
const syncSpin = () =>
  document.getAnimations().forEach((a: any) => {
    if (a.animationName?.startsWith("si-") && a.startTime !== 0) a.startTime = 0;
  });
export function initRail() {
  initSearch();
  let queued = false;
  const hasSi = (n: any) => n.nodeType === 1 && (n.classList.contains("si") || n.querySelector(".si"));
  new MutationObserver((rs) => {
    if (queued || !rs.some((r) => [...r.addedNodes].some(hasSi))) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      syncSpin();
    });
  }).observe(document.body, { childList: true, subtree: true });
  if (!$("plist")) return;
  addEventListener("kz-task-attention", feed);
  void readTaskAttention();
  onBoardCards((cards, projects, agents) => {
    last = { cards, projects: projects ?? last.projects, agents: agents ?? [] };
    feed();
    void drawSources();
    void readTaskAttention();
    onCount?.(cards);
    dispatchEvent(new Event("kz-cards"));
    told();
  });
  // The Notebook page has no React of its own: its list and filter come with the kit, which starts at once. Video has no kit
  // and lists no projects.
  if (!onBoard() && kitHere()) void kitFor().then((k) => connectRail(k.rail), () => {});
  // The sheet: add a folder, clone, create, or start a workspace; the current project is preselected.
  openAsked();
  $("padd").onclick = () => {
    const p = new URLSearchParams(location.search);
    addProject({ dir: ["run", "ws"].includes(p.get("view")) ? p.get("dir") : pickedDir() });
  };
}
// The one project the Projects filter is narrowed to (it keeps its choice in this browser; lib/rail/rail-store.ts).
function pickedDir() {
  try {
    const d = JSON.parse(localStorage.getItem("kz-rail-filter2") || "{}").dirs;
    return Array.isArray(d) && d.length === 1 ? (d[0] as string) : null;
  } catch {
    return null;
  }
}

// ---- footer (board page)
const meter = (p) => html`<span class="umtr"><i class="${p >= 85 ? "hi" : p >= 50 ? "mid" : ""}" style="width:${Math.min(100, p)}%"></i></span>`;
const when = (t) => (t ? new Date(t).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" }) : "unknown");
const NAME = { claude: "Claude", codex: "Codex" };
export function usageChips(list) {
  // The agent's mark and its 5-hour %, coloured as it fills; the full figures on hover/focus.
  const lvl = (p) => (p >= 95 ? " hi" : p >= 80 ? " mid" : "");
  return list
    .filter((u) => NAME[u.agent])
    .map((u) => {
      const mark = html`<svg aria-hidden="true"><use href="#i-${u.agent}"/></svg>`;
      if (u.error) return html`<span class="uchip na" tabindex="0">${mark}<b>–</b><span class="utip" role="tooltip"><b>${NAME[u.agent]}</b>Usage unavailable: ${u.error}</span></span>`;
      const head = u.five ?? u.week;
      const row = (label, w) => (w ? html`<span class="urow"><span>${label}</span><b class="${lvl(w.pct).trim()}">${w.pct}%</b><i><i style="width:${Math.min(100, w.pct)}%" class="${lvl(w.pct).trim()}"></i></i><small>resets ${when(w.resetsAt)}</small></span>` : "");
      return html`<span class="uchip" tabindex="0" aria-label="${NAME[u.agent]} usage">${mark}<b class="${lvl(head?.pct ?? 0).trim()}">${head ? head.pct + "%" : ""}</b><span class="utip" role="tooltip"><b>${NAME[u.agent]}</b>${row("5-hour window", u.five)}${row("Week", u.week)}</span></span>`;
    })
    .join("");
}
async function usage(refresh = false) {
  try {
    const r = await fetch("/usage" + (refresh ? "?refresh=1" : ""));
    if (!r.ok) return;
    const list = await r.json();
    $("usage").innerHTML = usageChips(list);
    // Nothing to refresh: only Claude and Codex report usage.
    $("usage-r").style.display = list.length ? "" : "none";
  } catch {}
}
async function phone() {
  try {
    const d = await (await fetch("/phone")).json();
    const el = $("phone");
    el.hidden = false;
    const [txt, on, tip] = !d.tailscale
      ? ["Tailscale off", false, "Tailscale is not running on this computer"]
      : d.online
        ? ["Phone connected", true, "A phone is online on your tailnet"]
        : ["Phone offline", false, d.phones ? "Your phone is not online on the tailnet" : "No phone on your tailnet"];
    el.title = tip;
    el.innerHTML = String(html`<svg aria-hidden="true"><use href="#i-phone"/></svg><span class="ptxt">${txt}</span><span class="dot${on ? "" : " off"}"></span>`);
  } catch {}
}
// Live terminals: the board's agent sessions plus the shells /shell started.
let agentPtys = 0;
let onCount: ((cards: any[]) => void) | null = null;
async function terms() {
  let shells = 0;
  try {
    store.shells = await (await fetch("/shells")).json();
    shells = store.shells.length;
    dispatchEvent(new Event("kz-shells"));
  } catch {}
  const n = agentPtys + shells,
    a = $("tcount");
  a.hidden = !n;
  a.querySelector("span").textContent = String(n);
  a.title = `${n} live terminal${n === 1 ? "" : "s"}: show them all`;
}
export function initFooter(goTerminal: () => void) {
  if (!$("foot")) return;
  // The Board drawer is position:fixed; it stops above the footer, whose height varies.
  const fh = () => document.documentElement.style.setProperty("--foot-h", $("foot").offsetHeight + "px");
  new ResizeObserver(fh).observe($("foot"));
  fh();
  void usage();
  void phone();
  setInterval(() => void usage(), 5 * 60_000);
  setInterval(() => void phone(), 60_000);
  $("usage-r").onclick = () => void usage(true);
  $("tcount").onclick = (e) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    e.preventDefault();
    goTerminal();
  };
  onCount = (cards) => {
    agentPtys = cards.filter((c) => c.pty?.alive).length;
    void terms();
  };
}
