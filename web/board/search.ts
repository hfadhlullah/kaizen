// Global search: the "Search" entry on top of the side menu, and Ctrl/Cmd+K anywhere, open one palette over
// workspaces, runs and tasks, chats, agent terminals, projects, pages and actions (modelled on Orca's "Jump to..."
// palette). This file gathers its rows: nothing is fetched but /chats, the rest is what the side menu already holds.
// The palette itself is React (components/search/search-palette.tsx). The board mounts it; the Notebook page loads it on
// its own (notebook/kit.ts) and opens it in place; Video, which carries no React, sends the person to the board with the
// palette open (?search=1).
import { $ } from "./dom.ts";
import { age } from "@lib/core";
import { openAdd } from "@lib/project/add-project.ts";
import { cardHref, kitFor, projName, railData, stateOf, titleOf, wsHref, wsLabel, wsOfCard } from "./workspace.ts";
import { useSearch } from "@lib/search/search.ts";
import type { Item } from "@lib/search/search-match.ts";
import { leaves, wsKey } from "./ws-tabs.ts";

const BOARD = typeof document !== "undefined" && !!document.getElementById("kz-portal");
// The pages that can open a thing in place answer this event and cancel it.
const ask = (name: string, detail: any) => !dispatchEvent(new CustomEvent(name, { cancelable: true, detail }));
// A page load: the Notebook writes the note it has open first (leave), the board has nothing to write.
const go = (href: string) => (BOARD ? void (location.href = href) : leave(href));
// A menu entry's own click: in place on the board, a page load elsewhere.
const page = (v: string, href: string) => () => {
  const a = document.querySelector<HTMLElement>(`.rail a[data-view="${v}"]`);
  a && BOARD ? a.click() : go(href);
};
const openWs = (dir: string, ws: string) => {
  if (!ask("kz-open-ws", { dir, ws })) go(wsHref(dir, ws));
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
  if (ask("kz-open-tab", { dir, ws, id })) return;
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
let chats: any[] = [];
function items(): Item[] {
  const { cards, projects = [], agents = [] } = railData();
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
      sub: projName(c.state, projects),
      when: c.moved ? age(c.moved, now) : undefined,
      hay: `${titleOf(c)} ${c.id ?? ""} ${c.text ?? ""} ${projName(c.state, projects)} ${st}`,
      at: c.moved ?? 0,
      dot: st,
      ico: c.kind === "run" ? "run" : "idea",
      act: () => {
        if (!ask("kz-open-card", { dir: c.state, id: c.kind === "run" ? c.id : undefined, text: c.text })) go(cardHref(c));
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
        if (!ask("kz-open-term", { dir: a.dir, ws: a.ws, key: a.key })) go(wsHref(a.dir, a.ws ?? ""));
      },
    });
  // Pages and actions. Each clicks the side menu's own control, so it behaves the same.
  const click = (id: string) => () => $(id)?.click();
  const acts: [string, string, () => void, string?][] = [
    ["Chat", "page", page("home", "/"), "home"],
    ["Icebox", "page", page("sources", "/?view=icebox"), "requests sources gathered capture inbox later add note"],
    ["Tasks", "page", page("tasks", "/?view=tasks"), "backlog"],
    ["Board", "page", page("board", "/?view=board"), "kanban runs"],
    ["Notes", "page", () => go("/notebook"), "notebook docs"],
    ["Settings", "page", page("settings", "/?view=settings"), "preferences config"],
    ["New task", "act", () => ($("newtop") ? $("newtop").click() : go("/?view=board")), "create add run"],
    ["Add a project", "act", () => openAdd({ dir: null }), "clone folder create workspace"],
    ["Toggle theme", "act", click("themet"), "dark light"],
    ["Collapse or expand menu", "act", click("fold"), "sidebar rail"],
    ["Keyboard shortcuts", "act", click("kbd"), "keys help"],
    ["Report an issue", "act", () => open("/issue", "_blank", "noopener"), "bug feedback"],
  ];
  for (const [title, ico, act, kw] of acts) out.push({ group: "Actions", title, hay: `${title} ${kw ?? ""}`, ico, act });
  return out;
}

function newTaskWith(text: string) {
  if (!$("newtop")) return void go("/?view=board");
  $("newtop").click();
  // The New task form is React: its box takes the text through the native setter so the form hears it.
  setTimeout(() => {
    const t = document.querySelector<HTMLTextAreaElement>('[role="dialog"] textarea');
    if (!t) return;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(t, text);
    t.dispatchEvent(new Event("input", { bubbles: true }));
  }, 80);
}

// Rows are read each time the palette opens and again when the side menu's data or the chats land.
// The palette's store: this bundle's own on the board; on the Notebook page the loaded kit's, which the mounted palette reads.
let S = useSearch;
const fill = () => S.getState().open && S.setState({ items: items() });
// Leaving for the board: the page first writes what it has not saved (the notebook's autosave waits 600 ms) by answering
// the `kz-leave` event with a promise through `wait`.
export function leave(href: string) {
  const waits: Promise<unknown>[] = [];
  dispatchEvent(new CustomEvent("kz-leave", { detail: { wait: (p: Promise<unknown>) => waits.push(p) } }));
  void Promise.allSettled(waits).then(() => (location.href = href));
}
export function openSearch() {
  if (BOARD) return show();
  kitFor().then(
    (k) => {
      S = k.useSearch;
      show();
    },
    () => leave("/?view=board&search=1"),
  );
}
function show() {
  S.setState({ open: true, items: items(), newTask: newTaskWith });
  // Chats live behind one fetch; the list fills in when they land.
  fetch("/chats")
    .then((r) => r.json())
    .then((d) => {
      chats = d.chats ?? [];
      fill();
    })
    .catch(() => {});
}
const toggle = () => (S.getState().open ? S.setState({ open: false }) : openSearch());

export function initSearch() {
  const mac = /Mac|iP(hone|ad)/.test(navigator.platform);
  const it = $("gsearch");
  if (it) it.onclick = (e) => (e.preventDefault(), openSearch());
  // Opened before the menu's data came in: fill in as it lands.
  addEventListener("kz-rail", fill);
  // Arriving from the notebook or Video with the palette asked for.
  if (BOARD && new URLSearchParams(location.search).get("search") === "1") {
    const q = new URLSearchParams(location.search);
    q.delete("search");
    history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash);
    setTimeout(openSearch, 400);
  }
  // Ctrl/Cmd+K anywhere, and Orca's own Cmd+J (Ctrl+Shift+J is the browser's console).
  addEventListener(
    "keydown",
    (e) => {
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
    },
    true,
  );
}
