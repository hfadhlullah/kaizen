// Global search: the "Search" entry on top of the side menu, and Ctrl/Cmd+K anywhere, open one palette over
// workspaces, runs and tasks, chats, agent terminals, projects, pages and actions (modelled on Orca's "Jump to..."
// palette). This file builds the rows from the side menu's data and says what each does; `useSearchRows` (use-search-rows.ts)
// reads that data and the chats while the palette is open.
// The palette itself is React (components/search/search-palette.tsx). The board mounts it; the Notebook page loads it on
// its own (notebook/kit.ts) and opens it in place; Video, which carries no React, sends the person to the board with the
// palette open (?search=1).
import { age, host, leave } from "@lib/core";
import type { RailData } from "@lib/server";
import { openAdd } from "@lib/project/add-project.ts";
import { cardHref, cardState as stateOf, projName, titleOf, wsHref, wsLabel, wsOfCardNow as wsOfCard } from "@lib/rail";
import { railActions } from "@lib/rail/rail-actions.ts";
import { kitFor } from "@lib/rail/rail-boot.ts";
import { menuGo } from "@lib/router";
import { toggleRail, toggleTheme, setHelp } from "@lib/shell";
import { newTask } from "@lib/board";
import { leaves, wsKey } from "@lib/run/ws-tabs.ts";
import { useSearch } from "./search.ts";
import type { Item } from "./search-match.ts";

// Set when the board starts (initSearch): the Notebook and Video are not the board.
let onBoard = () => false;
// A page load: the Notebook writes the note it has open first (leave), the board has nothing to write.
const go = (href: string) => (onBoard() ? void (location.href = href) : leave(href));
// A menu entry's own click: in place on the board, a page load elsewhere.
const page = (v: string, href: string) => () => (onBoard() ? menuGo(v) : go(href));
const openWs = (dir: string, ws: string) => {
  if (!host.open.ws({ dir, ws })) go(wsHref(dir, ws));
};
// The run view's saved layouts (run-view.ts keeps them here per workspace).
const layouts = (): Record<string, any> => {
  try {
    return JSON.parse(localStorage.getItem("kz-runtabs") || "{}");
  } catch {
    return {};
  }
};
// A tab: the board opens it in place; elsewhere its screen is chosen in storage, then the workspace loads.
const openTab = (dir: string, ws: string, id: string) => {
  if (host.open.tab({ dir, ws, id })) return;
  const all = layouts(),
    s = all[wsKey(dir, ws)],
    sc = s?.screens?.find((x) => leaves(x.tree).includes(id));
  if (sc)
    try {
      s.on = sc.id;
      localStorage.setItem("kz-runtabs", JSON.stringify(all));
    } catch {}
  go(wsHref(dir, ws));
};
// The run view's own tabs worth jumping to; agent tabs are listed with the terminals.
const TAB_KINDS = ["local", "preview", "note", "history", "shell"];
const browsed = (k: string) => {
  try {
    return localStorage.getItem("kz-browse:" + k)?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  } catch {}
};
// The palette's rows for the side menu's data and the chats read so far.
// What a run or task is doing, in words beside its project (the dot alone has to be decoded).
const STATUS: Record<string, string> = { wait: "needs you", plan: "planning", build: "building", review: "in review", stalled: "stalled", done: "done", aband: "abandoned" };
export function buildRows({ cards, projects = [], agents = [] }: RailData, chats: any[]): Item[] {
  const now = Date.now();
  const cur = new URLSearchParams(location.search);
  // The workspace open now: named by the address, or the one holding the run it names.
  const curRun = cur.get("id") && cards.find((c) => c.kind === "run" && c.state === cur.get("dir") && c.id === cur.get("id"));
  const curWs = cur.get("ws") ?? (curRun ? wsOfCard(curRun, projects) : null);
  const out: Item[] = [];
  const saved = layouts();
  // Workspaces, the one open now first; then by their latest run.
  const latest = new Map<string, number>();
  for (const c of cards) {
    const k = c.state + "\0" + wsOfCard(c, projects);
    latest.set(k, Math.max(latest.get(k) ?? 0, c.moved ?? 0));
  }
  for (const p of projects) {
    const name = projName(p.dir, projects);
    for (const w of p.workspaces ?? []) {
      const here = cur.get("dir") === p.dir && curWs === w.path;
      const at = latest.get(p.dir + "\0" + w.path);
      out.push({
        group: here ? "Current" : "Workspaces",
        title: wsLabel(w),
        sub: name,
        when: at ? age(at, now) : undefined,
        hay: `${wsLabel(w)} ${name} ${w.path} workspace`,
        at: here ? Infinity : at ?? 0,
        ico: "ws",
        act: () => openWs(p.dir, w.path),
      });
      const k = wsKey(p.dir, w.path),
        lay = saved[k];
      for (const t of lay?.tabs ?? []) {
        if (!TAB_KINDS.includes(t.kind) || lay.hidden?.includes(t.id)) continue;
        const title = (t.kind === "local" && browsed(k)) || t.title;
        out.push({ group: "Tabs", title, sub: `${wsLabel(w)} · ${name}`, hay: `${title} ${t.title} ${t.kind} ${t.note ?? ""} ${wsLabel(w)} ${name} tab`, ico: "tab", act: () => openTab(p.dir, w.path, t.id) });
      }
    }
    out.push({ group: "Projects", title: name, hay: `${name} ${p.dir} project`, ico: "proj", act: () => {
      const main = p.workspaces?.find((w) => w.main) ?? p.workspaces?.[0];
      main ? openWs(p.dir, main.path) : page("board", "/?view=board")();
    } });
  }
  // Runs and tasks, not archived.
  for (const c of cards.filter((c) => !c.archived)) {
    const st = stateOf(c);
    out.push({
      group: c.kind === "run" ? "Runs" : "Tasks",
      title: titleOf(c) || c.id,
      sub: [projName(c.state, projects), STATUS[st]].filter(Boolean).join(" · "),
      when: c.moved ? age(c.moved, now) : undefined,
      hay: `${titleOf(c)} ${c.id ?? ""} ${c.text ?? ""} ${projName(c.state, projects)} ${st}`,
      at: c.moved ?? 0,
      dot: st,
      ico: c.kind === "run" ? "run" : "idea",
      act: () => {
        if (!host.open.card({ dir: c.state, id: c.kind === "run" ? c.id : undefined, text: c.text })) go(cardHref(c));
      },
    });
  }
  for (const c of chats) {
    // updated is an ISO date string.
    const at = Date.parse(c.updated) || 0;
    out.push({
      group: "Chats & terminals",
      title: c.title || "Chat",
      sub: c.project ? projName(c.project, projects) : undefined,
      when: at ? age(at, now) : undefined,
      hay: `${c.title} chat ${c.project ?? ""}`,
      at,
      dot: c.busy ? "build" : undefined,
      ico: "chat",
      act: () => {
        try {
          sessionStorage.setItem("kz-chat", c.id);
        } catch {}
        page("home", "/")();
      },
    });
  }
  for (const a of agents)
    out.push({
      group: "Chats & terminals",
      title: a.name || a.agent || "Terminal",
      sub: projName(a.dir, projects),
      hay: `${a.name} ${a.agent ?? ""} ${a.run ?? ""} ${a.last ?? ""} ${projName(a.dir, projects)} terminal agent`,
      at: a.at ?? a.born ?? 0,
      dot: a.asking ? "wait" : a.busy ? "build" : "done",
      ico: "term",
      act: () => {
        if (!host.open.term({ dir: a.dir, ws: a.ws, key: a.key })) go(wsHref(a.dir, a.ws ?? ""));
      },
    });
  // Pages and actions. Each clicks the side menu's own control, so it behaves the same.
  const acts: [string, string, () => void, string?][] = [
    ["Chat", "page", page("home", "/"), "home"],
    ["Icebox", "page", page("sources", "/?view=icebox"), "requests sources gathered capture inbox later add note"],
    ["Tasks", "page", page("tasks", "/?view=tasks"), "backlog"],
    ["Board", "page", page("board", "/?view=board"), "kanban runs"],
    ["Notes", "page", () => go("/notebook"), "notebook docs"],
    ["Settings", "page", page("settings", "/?view=settings"), "preferences config"],
    ["New task", "act", () => (onBoard() ? newTask() : go("/?view=board")), "create add run"],
    ["Add a project", "act", () => openAdd({ dir: null }), "clone folder create workspace"],
    ["Toggle theme", "act", toggleTheme, "dark light"],
    ["Collapse or expand menu", "act", toggleRail, "sidebar rail"],
    ["Keyboard shortcuts", "act", () => setHelp(true), "keys help"],
    ["Report an issue", "act", () => open("/issue", "_blank", "noopener"), "bug feedback"],
  ];
  for (const [title, ico, act, kw] of acts) out.push({ group: "Actions", title, hay: `${title} ${kw ?? ""}`, ico, act });
  return out;
}

function newTaskWith(text: string) {
  if (!onBoard()) return void go("/?view=board");
  newTask(undefined, text);
}

// The rows are the palette's own (useSearchRows); this opens it.
// The palette's store: this bundle's own on the board; on the Notebook page the loaded kit's, which the mounted palette reads.
let S = useSearch;
export function openSearch() {
  if (onBoard()) return show();
  kitFor().then(
    (k) => {
      S = k.useSearch;
      show();
    },
    () => leave("/?view=board&search=1"),
  );
}
function show() {
  S.setState({ open: true, newTask: newTaskWith });
}
const toggle = () => (S.getState().open ? S.setState({ open: false }) : openSearch());

export function initSearch(board: boolean) {
  onBoard = () => board;
  railActions.search = openSearch;
  const mac = /Mac|iP(hone|ad)/.test(navigator.platform);
  let asked: ReturnType<typeof setTimeout> | undefined;
  // Arriving from the notebook or Video with the palette asked for.
  if (onBoard() && new URLSearchParams(location.search).get("search") === "1") {
    const q = new URLSearchParams(location.search);
    q.delete("search");
    history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash);
    asked = setTimeout(openSearch, 400);
  }
  // Ctrl/Cmd+K anywhere, and Orca's own Cmd+J (Ctrl+Shift+J is the browser's console).
  const onKey = (e: KeyboardEvent) => {
    // Ctrl+Shift+Space works in a terminal too: no shell or agent needs it.
    if (e.ctrlKey && e.shiftKey && e.code === "Space") {
      e.preventDefault();
      e.stopPropagation();
      return void toggle();
    }
    // A terminal keeps its keys: Ctrl+K there is the shell's kill-line.
    if ((e.target as Element)?.closest?.(".xterm")) return;
    const mod = mac ? e.metaKey : e.ctrlKey;
    const k = e.key.toLowerCase();
    if (mod && !e.altKey && ((k === "k" && !e.shiftKey) || (mac && k === "j" && !e.shiftKey))) {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    }
  };
  addEventListener("keydown", onKey, true);
  return () => (clearTimeout(asked), removeEventListener("keydown", onKey, true));
}
