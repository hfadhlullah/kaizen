// The run workspace's lifecycle (?view=ws&dir=&ws=; a run's or task's old address resolves to its workspace and picks that run
// in the panel): a tab bar over one folder holding terminals and the Browser, never runs. This module reads the address and
// the server, decides what the workspace opens (a shell in an empty one, a run's resumed agent, the Browser on a run's
// Preview), and answers the router's enter and leave. The rest is split by what it is: which tabs there are
// (ws-derive.ts, pure), the state it keeps (ws-store.ts), the redraw and the panel's pick (ws-draw.ts), what a person does
// (ws-actions.ts), which workspaces keep their panes mounted (kept.ts, pure), and what runs only while the run view is shown,
// the Preview polling, the keyboard and the reaction to a new /state (use-run-lifecycle.ts, a hook of the run panes). The
// panes, their layout and the Browser tab are React (components/run, lib/run/layout-store.ts). Panes of every workspace
// visited stay mounted, hidden, up to a cap, so leaving a workspace and coming back keeps a Browser page, a note's scroll and
// a terminal's screen; the run panel (#panel, drawn by panel.ts) docks on the right and shows one run, chosen in its picker.
// A workspace with no tab opens a shell in its folder. Split right or down shows a second tab beside the first.
import { cardHref, titleOf, wsHref, wsOfCardNow as wsOfCard } from "@lib/rail";
import { getRoute, navigate, setTitle, touchRoute } from "@lib/router";
import { cardKey as key, getServer, load, onServer, onState, railDataNow, readShells } from "@lib/server";
import { preview } from "@lib/markdown";
import { pick } from "@lib/project";
import { isTerm, liveKeys, pruneDead } from "./kept.ts";
import { followNew, mineNow, picked, seenRuns, tabs, draw } from "./ws-draw.ts";
import { byKey, autoTab, closeScreen, closeTab, moveItem, newPty, openAgent, openNew, openNoteTab, previewApp, projectNotes, show } from "./ws-actions.ts";
import { cx, edit, getWs, saved, setWs } from "./ws-store.ts";
import { devUrl, finished, leaves, loopbackUrl, migrate, previewOpens, reviewing, toOpen, wsKey } from "./ws-tabs.ts";
import { clearBrowse, fetchPreview, keepUrl, layoutOf, refreshPreview, replaceAll, requestBrowse, selectScreen, setDragging, getPanel, setPanel, setPanelActions, setRunActions, setRunView, useLayout, useRunView, work } from "./index.ts";

export { openNoteTab, openPreview } from "./ws-actions.ts";
let switched: string | null = null; // the project a deep link last switched the board to
const none = (t: string) => setRunView({ message: t });
// Called by navigate("run") and on every /state: draws the tab strip and keeps the panes.
export async function showRunView(nav = false) {
  const p = new URLSearchParams(location.search),
    dir = p.get("dir"),
    id = p.get("id"),
    task = p.get("idea");
  let ws = p.get("ws"),
    want: any = null; // the card the address names, whose tab is selected
  // A project this board is not showing: a deep link names its project, switched to once, as a rail click does.
  const away = async () => {
    if (getServer().all || !dir || dir === getServer().dir || dir === switched) return false;
    switched = dir;
    await pick(dir).catch(() => {});
    return true;
  };
  if (p.get("view") === "ws" && ws) {
    if (await away()) return showRunView(nav);
  } else {
    const find = (cs) => cs.find((x) => x.state === dir && (id ? x.kind === "run" && x.id === id : x.kind === "idea" && x.text === task));
    const c = find(getServer().state.cards);
    // A launched task becomes a run: its agent session moves to the run's card, and the view follows.
    const pk = task && (c ?? getWs().card)?.kind === "idea" && (c ?? getWs().card)?.pty?.key;
    const run = pk && getServer().state.cards.find((x) => x.kind === "run" && x.state === dir && (x.pty?.key === pk || x.pty?.all?.includes(pk)));
    if (run) {
      history.replaceState(null, "", cardHref(run));
      touchRoute();
      return showRunView(nav);
    }
    if (!c) {
      if (await away()) return showRunView(nav);
      if (!getServer().all && find(railDataNow().cards)) location.href = "/?all=1&" + p.toString();
      else (stopPanes(), setWs({ ctx: null, card: null }), none(`That ${id ? "run" : "idea"} was not found.`));
      return;
    }
    want = c;
    ws = wsOfCard(c);
  }
  if (!dir || !ws) return void (stopPanes(), setWs({ ctx: null, card: null }), none("That workspace was not found."));
  const k = wsKey(dir, ws);
  const fresh = getWs().ctx?.k !== k;
  // Each workspace has its own centre: switching hides this one's terminals and drops its other panes (its shells keep running on the server).
  if (fresh) (stopPanes(), setWs({ card: null, ctx: { dir, ws, k } }));
  if (fresh && !was.has(k)) was.set(k, new Set(mineNow().filter(reviewing).map(key))); // what is already in review does not open the Browser
  if (fresh) seenRuns.set(k, new Set(mineNow().map(key))); // what is here on arrival is not new
  if (fresh) previewAt.delete(k); // nor is a preview: arriving only records it
  // The header titles a phone's workspace: the run, else the branch.
  const w = railDataNow().projects?.find((x) => x.dir === dir)?.workspaces?.find((x) => x.path === ws);
  setTitle(want ? titleOf(want) : w?.branch || ws.split(/[\\/]/).pop() || "Workspace");
  // Layouts saved per run before workspaces move to their workspace; keys no card owns stay.
  if (getServer().state.cards.some((c) => key(c) in useLayout.getState().all)) {
    const all = structuredClone(useLayout.getState().all);
    if (migrate(all as any, getServer().state.cards, key, wsOfCard)) replaceAll(all);
  }
  try {
    const r = await fetch("/shells?dir=" + encodeURIComponent(dir));
    setWs({ shells: r.ok ? await r.json() : [] });
  } catch {}
  if (fresh) {
    try {
      const d = await (await fetch("/agents?dir=" + encodeURIComponent(dir))).json();
      setWs({ agents: d.agents ?? [], defAgent: d.default ?? "" });
    } catch {}
  }
  if (getWs().ctx?.k !== k) return;
  // Every navigation (a notification, a Board card, a link) picks the card's run in the panel, even for an address already open: a finished run opens read-only.
  // A fresh visit forgets the old pick (waiting first again); one made during the visit stays.
  if (fresh) picked.delete(k);
  if (want?.kind === "run" && (nav || fresh)) picked.set(k, key(want));
  followNew(); // a run created while the view was away (the lifecycle hook only reacts while shown) takes the pick before the first draw
  // A workspace with nothing open starts a shell in its folder (no agent, no run). A live run whose own Claude
  // session is not open anywhere on the board is resumed here, once per visit.
  if (!getWs().noPty) {
    if (!tabs().length && !autoShell.has(k)) return void (autoShell.add(k), newPty());
    // Not while a launch from the board is coming up: its terminal is not tied to the new run card yet, and
    // resuming the run here would open a second agent on the same session beside it (the stray "Agent" tab).
    const launching = !!work.wantPty && Date.now() - work.wantPty.at < 20_000;
    if (want && want.kind === "run" && !finished(want) && !want.pty && !launching && !getWs().shells.some((x) => x.run === key(want)) && !autoShell.has(key(want))) {
      autoShell.add(key(want));
      void openAgent(want, false, false);
    }
  }
  if (!showTerm()) draw();
}
// The terminal the sidebar asked for, selected once the workspace's tabs are known.
let wantTerm: string | null = null;
function showTerm() {
  // A launch from the board names its terminal (work.wantPty): it is selected once its tab exists,
  // and the ask lapses after a while so a launch that never came up cannot pull focus later.
  const w = work.wantPty && Date.now() - work.wantPty.at < 20_000 ? work.wantPty.key : null;
  if (work.wantPty && !w) work.wantPty = null;
  // Asked for by name (the sidebar's mark, a launch): shown even if its tab was closed before.
  const want = wantTerm || w;
  if (want) edit((s) => ({ ...s, hidden: s.hidden.filter((h) => h !== "agent:" + want && h !== "sh:" + want) }));
  const t = tabs().find((x) => x.key === want);
  wantTerm = null;
  if (t && work.wantPty?.key === t.key) work.wantPty = null;
  return !!t && (show(t.id), true);
}
const autoShell = new Set<string>();


// Leaving the workspace: its panes stay mounted (hidden), the shells keep running on the server.
export function stopPanes() {
  setPanel({ parked: true });
  // No items, no workspace shown: its panes stay in `kept` (run-view-store), hidden.
  setRunView({ items: [], wsk: null, ws: null });
  clearBrowse();
}
export function runStop() {
  stopPanes();
  setWs({ card: null, ctx: null });
  setPanel({ pn: false });
}

// The keys of the workspace's runs that were at review/done on the last tick, per workspace.
const was = new Map<string, Set<string>>();
// A run in the open workspace moves into review or done with a localhost address in its ## Preview:
// the Browser opens on it, once per run. The first tick of a workspace only records.
export async function autoBrowse() {
  if (!getWs().ctx) return;
  const k = cx().k,
    mine = mineNow(),
    prev = was.get(k);
  was.set(k, new Set(mine.filter(reviewing).map(key)));
  if (!prev) return;
  for (const c of toOpen(mine, prev, saved().seen ?? [], key)) {
    let u: string | undefined;
    try {
      const doc = await (await fetch(`/run/${encodeURIComponent(c.id)}?dir=${encodeURIComponent(c.state)}`)).json();
      // Only an address the report names: with none, the lowest port in the workspace was a guess
      // (it once opened Claude Code's own local port, "not found").
      const pv = preview(doc.impl);
      if (!loopbackUrl(pv)) continue;
      u = devUrl(pv, await (await fetch("/devports?ws=" + encodeURIComponent(cx().ws))).json());
    } catch {}
    if (!u || getWs().ctx?.k !== k || saved().seen?.includes(key(c))) continue;
    edit((s) => ({ ...s, seen: [...(s.seen ?? []), key(c)] }));
    keepUrl(k, u);
    autoTab({ id: "local", kind: "local", title: "Browser" });
    requestBrowse(k, u);
  }
}

// `kaizen preview <url|image>` (cli/preview.ts) wrote what an agent changed: the Browser tab opens
// on it, inside the board. Never an outside window. Only in the workspace it was written from, and
// only while you watch it: each visit's first look records the newest (`previewAt`, per visit), so a
// click, a switch or a reload never opens a tab, or reopens one you closed.
const previewAt = new Map<string, number>();
export async function pollPreview() {
  if (!getWs().ctx) return;
  const k = cx().k, dir = cx().dir;
  const p = await fetchPreview(dir, cx().ws);
  if (getWs().ctx?.k !== k) return;
  const at = p?.at ?? 0, last = previewAt.get(k);
  if (last !== undefined && at <= last) return;
  previewAt.set(k, at);
  if (!p || !previewOpens(at, last)) return;
  if (p.image) {
    // A screenshot belongs in Preview; a live page in the Browser. An open Preview reads the new one.
    const open = saved().tabs.some((x) => x.id === "preview");
    autoTab({ id: "preview", kind: "preview", title: "Preview" });
    if (open) refreshPreview();
    return;
  }
  keepUrl(k, p.url!);
  autoTab({ id: "local", kind: "local", title: "Browser" });
  requestBrowse(k, p.url!);
}
 


// A kept terminal whose session is gone (ended, or its tab closed in another window) is unmounted (kept.ts). `dropDead` reads
// the lists the board already has; those lag a session started a moment ago (/shells is read with each all-projects /state),
// so a /state tick or a terminal that ended reads /shells first (`pruneKept`, only when a hidden workspace holds a terminal).
// Without that read a live terminal started just before leaving the workspace would count as gone.
function dropDead() {
  const s = getServer(),
    cur = useRunView.getState().kept,
    next = pruneDead(cur, liveKeys(s.shells, s.state.agents ?? [], s.state.cards), getWs().ctx?.k ?? null);
  if (next !== cur) setRunView({ kept: next });
}
export async function pruneKept() {
  const shown = getWs().ctx?.k;
  if (!Object.entries(useRunView.getState().kept).some(([k, v]) => k !== shown && v.items.some(isTerm))) return;
  if (await readShells()) dropDead(); // offline: no list to judge by, nothing is dropped
}
export const ended = () => void (load(true), pruneKept());
// The workspace address, in the history, and the run view for it.
function goWs(dir: string, ws: string) {
  history.pushState(null, "", wsHref(dir, ws));
  touchRoute();
  navigate("ws");
}
// A workspace row opens in place: the run view resolves it (showRunView).
export const openWsIn = goWs;
// The sidebar's agent mark: open that workspace with the agent's terminal tab selected.
export function openTermIn({ dir, ws, key }: { dir: string; ws: string; key: string }) {
  wantTerm = key;
  if (getWs().ctx?.k === wsKey(dir, ws) && getRoute().view === "run") return void showTerm();
  goWs(dir, ws);
}
// Search's Tabs group: open the workspace on the screen holding that tab.
export function openTabIn({ dir, ws, id }: { dir: string; ws: string; id: string }) {
  const k = wsKey(dir, ws),
    sc = layoutOf(k).screens.find((x) => leaves(x.tree).includes(id));
  if (sc) selectScreen(k, sc.id);
  if (getWs().ctx?.k === k && getRoute().view === "run") return void draw();
  goWs(dir, ws);
}
export function initRunView() {
  // A /state change, new shells or a session that ended: terminals kept hidden whose session is gone are unmounted.
  onServer((x) => x.shells, dropDead);
  onState(() => void pruneKept());
  // The panel's project-notes button; its close button and the scrim are panel.ts's.
  setPanelActions({ notes: () => void projectNotes() });
  setRunActions({
    select: (sid) => {
      selectScreen(cx().k, sid);
      draw();
    },
    close: (sid) => void closeScreen(sid),
    closeItem: (id) => void closeTab(id),
    openNew,
    runApp: () => void previewApp(),
    move: moveItem,
    drag: setDragging,
    dragging: () => useLayout.getState().dragging,
    drop: (to) => {
      const id = useLayout.getState().dragging;
      if (id) moveItem(id, to);
    },
    openHere: (k) => byKey(k) && void openAgent(byKey(k), true),
    pick: (k) => byKey(k) && (picked.set(cx().k, k), draw()),
    openNote: openNoteTab,
    termEnded: ended,
    currentRun: () => (getWs().card?.id ? { dir: getWs().card.state, id: getWs().card.id } : null),
    previewTarget: () => {
      const { ctx, card } = getWs();
      return (
        ctx && {
          dir: ctx.dir,
          ws: ctx.ws,
          card: card ? { id: card.id, kind: card.kind, state: card.state } : null,
          impl: getPanel().runDoc && getPanel().runDoc.id === card?.id ? getPanel().runDoc.impl : null,
        }
      );
    },
  });
}
// Opens a card's workspace, its address in the history.
export function openWorkspace(c) {
  const u = cardHref(c);
  if (location.pathname + location.search !== u) history.pushState(null, "", u);
  touchRoute();
  navigate("run");
}
