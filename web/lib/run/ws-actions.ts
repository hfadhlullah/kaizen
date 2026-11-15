// What a person does in the run workspace, as store actions: open or close a tab, start a terminal or an agent, split, move
// and drag items between panes, the Run app button, the pane keys. Each changes the layout store (lib/run/layout-store.ts) or
// asks the server, then redraws (ws-draw.ts); the panes themselves are React (components/run).
import { ask, isPhone, post, toast } from "@lib/core";
import { cardKey as key, getServer, load } from "@lib/server";
import { wsOfCardNow as wsOfCard } from "@lib/rail";
import { setHelp } from "@lib/shell";
import { preview } from "@lib/markdown";
import { devUrl, leaves } from "./ws-tabs.ts";
import { tabs, draw } from "./ws-draw.ts";
import type { Tab } from "./ws-derive.ts";
import { addShell, cx, edit, getWs, saved, screens, setElsewhere, setWs } from "./ws-store.ts";
import { boxesOf, detach, focusItem, focusPane, keepUrl, moveInLayout, nearestPane, patch, placeItems, rects, requestBrowse, selectScreen, setFlip, setPanel, getPanel, setRunView, setTarget, showItem, useLayout } from "./index.ts";

export const byKey = (k: string) => getServer().state.cards.find((x) => key(x) === k);

// Moves an item out of its tab into another one (split beside a pane there, or next to its
// focused pane), or into a tab of its own (to = null). Terminals keep running and frames stay loaded.
export function moveItem(id: string, to: string | null, at?: { pane: string; dir: "cols" | "rows"; before: boolean }) {
  if (moveInLayout(cx().k, id, to, at)) draw();
}
export function addTab(t: Tab) {
  if (!saved().tabs.some((x) => x.id === t.id)) edit((s) => ({ ...s, tabs: [...s.tabs, t] }));
  // Already open somewhere: moving it into the target screen means taking it out of its old one.
  else if (useLayout.getState().target) detach(cx().k, t.id);
  show(t.id);
}
// Automatic opens (a run's Preview, `kaizen preview`) bring a tab forward only when it is not open yet;
// an open one just navigates, so the user can leave it.
export const autoTab = (t: Tab) => { if (!saved().tabs.some((x) => x.id === t.id)) addTab(t); };
// After an item is added: place it (which uses the split target) and show the screen holding it.
export function show(id: string) {
  placeItems(cx().k, tabs().map((t) => t.id));
  showItem(cx().k, id);
  draw();
}
export const openNoteTab = (name: string) => addTab({ id: "note:" + name, kind: "note", title: name.slice(name.lastIndexOf("/") + 1), note: name });
export const openPreview = () => {
  addTab({ id: "preview", kind: "preview", title: "Preview" });
  if (isPhone()) setFlip(false); // Preview is a centre tab: the sheet would sit over it
};

// The run's recorded session, resumed in a board terminal tied to it. While it still runs in
// another terminal the server says so (409 live) and a tab explains; with no session, a shell.
export async function openAgent(c, again = false, focus = true) {
  const k = key(c);
  const r = await fetch("/shell", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dir: c.state, ws: cx().ws, run: k, resume: true }) }).catch(() => null);
  if (r?.ok) {
    setElsewhere(k, false);
    const sh = await r.json();
    addShell(sh);
    return focus ? show("sh:" + sh.key) : draw();
  }
  const j: any = r ? await r.json().catch(() => ({})) : {};
  if (r?.status === 409 && j.live) {
    setElsewhere(k, true);
    if (again) toast("Still running in another terminal");
    return draw();
  }
  setElsewhere(k, false);
  if (again) toast(j.error || "Could not resume the session");
  else draw();
}

// `yolo` only when the + menu's switch was flipped; otherwise the server applies that agent's saved setting.
export async function newPty(agent?: string, yolo?: boolean) {
  const r = await fetch("/shell", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dir: cx().dir, ws: cx().ws, run: cx().k, ...(agent ? { agent, yolo } : {}) }) });
  if (r.status === 501) {
    setWs({ noPty: true });
    return draw();
  }
  if (!r.ok) {
    // 429 (too many terminals), 403, anything else: say why, and keep the tab bar drawn.
    let why = "";
    try {
      why = (await r.json()).error;
    } catch {}
    toast(why ? "No new terminal: " + why : "No new terminal (" + r.status + ")");
    return draw();
  }
  const sh = await r.json();
  addShell(sh);
  show("sh:" + sh.key);
}

// The Run app button (play icon; the + menu's Preview is the run's Preview tab): the workspace's app in the Browser tab. A dev server already listening
// opens at once; otherwise the board starts the folder's dev script in a terminal here, waits
// for its port, then opens it. No dev script: the run's Preview (report and screenshots).
let starting = false;
export async function previewApp() {
  if (!getWs().ctx || starting) return;
  const c = cx();
  const ports = async (): Promise<number[]> => {
    try {
      return await (await fetch("/devports?ws=" + encodeURIComponent(c.ws))).json();
    } catch {
      return [];
    }
  };
  // The newest run here names the page to open (its ## Preview), when it has one.
  const card = getServer().state.cards.filter((x) => x.state === c.dir && wsOfCard(x) === c.ws && x.id).sort((a, b) => String(b.id).localeCompare(String(a.id)))[0];
  let pv = "";
  try {
    if (card) pv = preview((await (await fetch(`/run/${encodeURIComponent(card.id)}?dir=${encodeURIComponent(c.dir)}`)).json()).impl) ?? "";
  } catch {}
  const openAt = (u: string) => {
    keepUrl(c.k, u);
    addTab({ id: "local", kind: "local", title: "Browser" });
    requestBrowse(c.k, u);
  };
  const now = await ports();
  if (now.length) return openAt(devUrl(pv, now)!);
  const u = devUrl(pv, []);
  const r = await fetch("/shell", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dir: c.dir, ws: c.ws, run: c.k, dev: true }) }).catch(() => null);
  if (!r?.ok) {
    let why = "";
    try {
      why = (await r!.json()).error;
    } catch {}
    toast(why ? `Preview: ${why}` : "Preview: the dev server did not start");
    return openPreview();
  }
  const sh = await r.json();
  addShell(sh);
  draw();
  starting = true;
  toast("Starting the app…");
  let handled = false,
    retry = false;
  try {
    // Up to a minute for the first port; Linux only reads ports, elsewhere the run's address after a pause.
    for (let i = 0; i < 40 && getWs().ctx?.k === c.k; i++) {
      await new Promise((ok) => setTimeout(ok, 1500));
      const p = await ports();
      if (p.length) return openAt(devUrl(pv, p)!);
      // The dev server's terminal says its port is taken: ask whether to stop what holds it, then start again.
      const cf = await portConflict(sh.key);
      if (cf) {
        handled = true;
        retry = await askStopPort(cf);
        break;
      }
      if (i === 5 && u && !navigator.platform.startsWith("Linux")) return openAt(u);
    }
    if (!handled && getWs().ctx?.k === c.k) toast("The app did not open a port. Its terminal tab shows why.");
  } finally {
    starting = false;
  }
  if (retry) return previewApp();
}

type Conflict = { port: number; board?: boolean; holders: { pid: number; name: string; cmd: string; cwd: string }[] };
async function portConflict(key: string): Promise<Conflict | null> {
  try {
    const r = (await (await fetch("/shell/conflict?key=" + encodeURIComponent(key))).json()) as Partial<Conflict>;
    return r.port ? (r as Conflict) : null;
  } catch {
    return null;
  }
}
// "Port 3000 is already in use": who holds it, and the choice to stop it. True when it was stopped (the caller starts again).
async function askStopPort(cf: Conflict): Promise<boolean> {
  const who = cf.holders.map((h) => `${h.name || "a process"} (pid ${h.pid})${h.cwd ? ` in ${h.cwd}` : ""}`).join(", ");
  if (cf.board) return toast(`Port ${cf.port} is this board's own: the app needs another port.`), false;
  const yes = await ask({
    title: `Port ${cf.port} is already in use`,
    description: who ? `${who} is using it. Stop it so the app can start on this port?` : "Something is using it. Stop it so the app can start on this port?",
    confirmLabel: "Stop it and run the app",
    danger: true,
  });
  if (!yes) return false;
  try {
    const r = await fetch("/port/stop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ port: cf.port }) });
    if (r.ok) return true;
    toast(`Could not stop it: ${((await r.json()) as { error?: string }).error ?? "unknown error"}`);
  } catch {
    toast("Could not stop it: the board did not answer");
  }
  return false;
}

export async function closeTab(id: string) {
  const wk = cx().k;
  if (id.startsWith("sh:")) {
    await post("/pty/exit", { key: id.slice(3) });
    setWs((s) => ({ shells: s.shells.filter((x) => "sh:" + x.key !== id) }));
  } else if (id.startsWith("agent:")) {
    // Closing the tab ends the agent, so the sidebar stops listing it; one mid-turn asks first.
    const k = id.slice(6),
      a = getServer().state.agents?.find((x) => x.key === k);
    if (a?.busy && !(await ask({ title: "This agent is still working. End it?", confirmLabel: "End", danger: true }))) return;
    patch(wk, (s) => ({ ...s, hidden: [...s.hidden, id], hb: { ...s.hb, [id]: a?.born ?? 0 } }));
    await post("/pty/exit", { key: k });
    load(true);
  }
  else if (id.startsWith("wait:")) setElsewhere(id.slice(5), false);
  else patch(wk, (s) => ({ ...s, tabs: s.tabs.filter((t) => t.id !== id) }));
  if (getWs().ctx?.k === wk) draw();
}
// A tab's ×: everything in it closes (shells end, the agent is only hidden).
export async function closeScreen(sid: string) {
  const sc = saved().screens.find((x) => x.id === sid);
  for (const id of sc ? leaves(sc.tree) : []) await closeTab(id);
}

// + makes a new tab; split right/down adds to the tab shown. `n` is a menu item's data-n.
export function openNew(n: string, mode: string, yolo?: boolean) {
  const s = saved();
  setTarget(mode === "tab" || !s.on ? null : { screen: s.on, dir: mode as "cols" | "rows" });
  if (n === "shell") void newPty();
  else if (n.startsWith("agent:")) void newPty(n.slice(6), yolo);
  else if (n === "local") addTab({ id: "local", kind: "local", title: "Browser" });
  else if (n === "history") addTab({ id: "history", kind: "history", title: "History" });
  else openPreview();
}
// Ctrl+Space r / d: a second terminal like the focused one (same agent, or a shell), split right or down.
// Anything else (Browser, Preview, notes) has no copy to make, so the menu opens to pick from.
function likeFocused(): string | null {
  const sc = screens().find((x) => x.id === saved().on),
    t = sc && tabs().find((x) => x.id === sc.focus),
    w = getWs();
  if (t?.kind === "shell") return "shell";
  if (t?.kind === "agent") return "agent:" + (t.agent ?? (w.defAgent || w.agents[0]?.cmd || ""));
  return null;
}

// The strip's Project notes: the project's notes as a tree in the panel (components/run/project-notes.tsx); a note opens as a centre tab.
export async function projectNotes() {
  const pn = !getPanel().pn;
  setPanel({ pn });
  if (!pn) return;
  setRunView({ notes: { loading: true } });
  try {
    const d = await (await fetch("/vault?dir=" + encodeURIComponent(cx().dir))).json();
    setRunView({ notes: { names: (d.notes ?? []).map((n) => n.name).sort() } });
  } catch {
    setRunView({ notes: { failed: true } });
  }
}

// The keyboard, tmux style: Ctrl+Space puts focus in the current pane, then one more key
// moves it: arrows or hjkl between panes, 1-9, n, p between tabs.
const setPane = (id: string) => {
  focusItem(cx().k, id);
  draw();
  focusPane(id);
};
const DIRS = { ArrowLeft: "l", h: "l", ArrowRight: "r", l: "r", ArrowUp: "u", k: "u", ArrowDown: "d", j: "d" } as const;
export function paneKey(k: string) {
  if (k === "?") {
    (document.activeElement as HTMLElement)?.blur(); // Escape closes it only from outside the terminal
    return void setHelp(true);
  }
  if (k === "x") {
    const sc = screens().find((x) => x.id === saved().on);
    if (sc) void closeTab(sc.focus).then(() => focusPane(screens().find((x) => x.id === saved().on)?.focus));
    return;
  }
  const mode = { c: "tab", r: "cols", d: "rows" }[k];
  const same = mode && mode !== "tab" && getWs().noPty === false ? likeFocused() : null;
  if (same) return void openNew(same, mode!);
  if (mode) return void setRunView({ menu: mode as "tab" | "cols" | "rows" });
  const s = saved(),
    scs = screens(),
    at = scs.findIndex((x) => x.id === s.on),
    sc = scs[at];
  if (!sc) return;
  if (DIRS[k]) {
    const to = nearestPane(boxesOf(rects(sc.tree).panes), sc.focus, DIRS[k]);
    if (to) setPane(to);
    return;
  }
  const i = k === "n" ? (at + 1) % scs.length : k === "p" ? (at - 1 + scs.length) % scs.length : /^[1-9]$/.test(k) ? +k - 1 : -1;
  const to = scs[i];
  if (!to) return;
  selectScreen(cx().k, to.id);
  draw();
  focusPane(to.focus);
}
