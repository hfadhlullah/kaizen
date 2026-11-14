// The floating Home window: agents and shells in kaizen's own folder (~/.kaizen/home), so you can talk to an agent
// before choosing a project. A panel over every view of the board; minimized, it waits as a "Home" row at the top of the
// Projects list, its terminals still running. Ctrl+Alt+A or the button at the bottom right toggles it. The server places
// these terminals itself (POST /shell with home: true); the page never names a folder. components/home/home-window.tsx
// draws it; board/home-ws.ts wires the events only the old code can see. The rules here have no DOM (home-window.test.ts).
import { create } from "zustand";
import { ask, isPhone, toast } from "@lib/core";
import { getServer, setShells } from "@lib/server";

export type HomeWsState = "open" | "min" | "closed";
export type HomeShell = { key: string; run?: string; title: string; agent?: string; dir?: string };
export type Place = { x: number; y: number };
export const STATE_KEY = "kz-home-ws";
export const WINDOW_AT = "kz-home-ws-at";
export const BUTTON_AT = "kz-home-ws-btn";
// Only these agents have a mark of their own in the sprite.
export const AGENT_MARKS = ["claude", "codex", "gemini"];
export const markOf = (cmd?: string) => (cmd && AGENT_MARKS.includes(cmd) ? cmd : "ai");

// The Home window's terminals, in the server's order, less those asked to exit (the server lists them for up to 5 s more:
// an agent gets its /exit first). Never tabs again.
export const homeTabs = (shells: HomeShell[], ending: string[]) =>
  shells.filter((s) => s.run === "home" && !ending.includes(s.key));
// The tab shown: the one asked for, else the last.
export const currentTab = (tabs: HomeShell[], on: string) =>
  tabs.some((t) => t.key === on) ? on : (tabs[tabs.length - 1]?.key ?? "");
// A spot kept inside the window: `w` wide, never lost off the right, or more than 40 px up from the bottom.
export const clampPlace = (p: Place, w: number, vw: number, vh: number): Place => ({
  x: Math.max(0, Math.min(vw - w, p.x)),
  y: Math.max(0, Math.min(vh - 40, p.y)),
});
export const readPlace = (raw: string | null): Place | null => {
  try {
    const at = JSON.parse(raw ?? "null");
    return Number.isFinite(at?.x) && Number.isFinite(at?.y) ? { x: at.x, y: at.y } : null;
  } catch {
    return null;
  }
};
// A press that moved 4 px or more is a drag, so the button's click is skipped.
export const isDrag = (dx: number, dy: number) => Math.hypot(dx, dy) >= 4;
// A saved state that brings the window back on a page load: a computer only, and only open or minimized.
export const restoredState = (raw: string | null, phone: boolean): HomeWsState | null =>
  !phone && (raw === "open" || raw === "min") ? raw : null;

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const keep = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* the state lasts this page only */
  }
};

type Ws = {
  st: HomeWsState;
  max: boolean;
  on: string; // the tab asked for; currentTab() falls back to the last
  ending: string[];
  agents: { cmd: string; name: string }[];
  dflt: string;
  agentsRead: boolean;
};
export const useHomeWs = create<Ws>()(() => ({
  st: "closed",
  max: false,
  on: "",
  ending: [],
  agents: [],
  dflt: "",
  agentsRead: false,
}));
const set = useHomeWs.setState;
const get = useHomeWs.getState;
// The live shells are the server store's slice (the footer and the Terminal page read it too).
const tabsNow = () => homeTabs(getServer().shells, get().ending);

// `keepIt` is false where a phone opens Home only when asked and never on the next page load.
export function showHomeWs(st: HomeWsState, keepIt = true) {
  set({ st });
  if (keepIt) keep(STATE_KEY, st);
}
export function startHomeWs(search: string) {
  const q = new URLSearchParams(search);
  // Sent here by wsHref() for a Home terminal (Search on the notebook or video page).
  if (q.has("homews")) {
    q.delete("homews");
    history.replaceState(history.state, "", "/?" + q);
    set({ st: "open" });
    if (!isPhone()) keep(STATE_KEY, "open");
    return true;
  }
  const st = restoredState(read(STATE_KEY), isPhone());
  if (st) set({ st });
  return st === "open";
}
export const selectHomeTab = (on: string) => set({ on });
export const toggleMax = () => set((s) => ({ max: !s.max }));

export async function readHomeAgents() {
  if (get().agentsRead) return;
  try {
    const r = await (await fetch("/agents?home=1")).json();
    set({ agents: r.agents ?? [], dflt: r.default ?? "", agentsRead: true });
  } catch {
    /* the menu offers Shell alone */
  }
}
export async function refreshHomeWs() {
  try {
    setShells(await (await fetch("/shells")).json());
  } catch {
    /* the list stays as it was */
  }
}
// No `yolo`: the server applies that agent's saved bypass setting, as a run workspace's + does by default.
export async function startHomeShell(agent?: string, yolo?: boolean, prompt?: string) {
  const r = await fetch("/shell", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      home: true,
      ...(agent ? { agent, ...(yolo ? { yolo } : {}), ...(prompt ? { prompt } : {}) } : {}),
    }),
  }).catch(() => null);
  if (!r?.ok) {
    let why = "";
    try {
      why = (await r!.json()).error;
    } catch {
      /* no reason given */
    }
    return toast(why ? "No new terminal: " + why : "No new terminal" + (r ? ` (${r.status})` : ""));
  }
  const sh = await r.json();
  setShells([...getServer().shells.filter((x) => x.key !== sh.key), sh]);
  set({ on: sh.key });
}
// An empty workspace that opens starts the default agent, as an empty run workspace does.
async function startDefault() {
  await readHomeAgents();
  const { agents, dflt } = get();
  await startHomeShell((agents.find((x) => x.cmd === dflt) ?? agents[0])?.cmd);
}
// The list may not be read yet (just after a page load): ask before starting a second agent.
export const startIfEmpty = () => refreshHomeWs().then(() => !tabsNow().length && startDefault());
const exit = (key: string) => {
  set((s) => ({ ending: [...s.ending, key] }));
  return fetch("/pty/exit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key }),
  }).catch(() => null);
};
export async function closeHomeTab(key: string) {
  await exit(key);
  if (get().on === key) set({ on: "" });
}
// × ends the workspace: its terminals are asked to exit, after a yes when some are running.
export async function closeAllHome() {
  const ts = tabsNow();
  if (
    ts.length &&
    !(await ask({
      title: `End ${ts.length} Home terminal${ts.length === 1 ? "" : "s"}?`,
      confirmLabel: "End",
      danger: true,
    }))
  )
    return;
  await Promise.all(ts.map((t) => exit(t.key)));
  set({ on: "" });
  showHomeWs("closed");
}
export function toggleHome() {
  if (get().st === "open") return showHomeWs("min");
  showHomeWs("open");
  if (!tabsNow().length) void startIfEmpty();
}
// A Home terminal asked for by key (Search, the resource monitor, the phone's Agents list).
export function openHomeTerm(key: string) {
  set({ on: key, st: "open" });
  if (!isPhone()) keep(STATE_KEY, "open"); // a phone opens Home only when asked, never on the next page load
  void refreshHomeWs();
}
// The phone's New sheet and the Storage panel's Cleanup start a terminal here (detail.prompt).
export function startHomeFrom(d: { agent?: string; yolo?: boolean; prompt?: unknown } | undefined) {
  set({ st: "open" });
  if (!isPhone()) keep(STATE_KEY, "open");
  void startHomeShell(d?.agent || undefined, !!d?.yolo, typeof d?.prompt === "string" ? d.prompt : undefined);
}
