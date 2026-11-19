// Which page the board shows, without the DOM (tested in router.test.ts): the view an address or a name asks for, what a phone
// does with it, the <body> classes the legacy stylesheet keys on, the address a view has, the pages that are drawn when first
// opened, and the run an address names.
export type View =
  "home" | "chat" | "device" | "board" | "tasks" | "task" | "run" | "sources" | "terminal" | "settings";
const KNOWN = ["settings", "sources", "terminal", "board", "tasks", "task", "run", "chat", "device"];
// The view a name (the ?view= value or a menu item) asks for. Aliases: icebox is sources, ws is the run workspace, ideas is
// tasks; anything unknown is Home. A phone keeps Runs and Tasks reachable and has no Board, Icebox or Chat page; a computer
// has no Runs page.
export function resolveView(name: string | null | undefined, phone: boolean): View {
  let v = name === "icebox" ? "sources" : name === "ws" ? "run" : name === "ideas" ? "tasks" : (name ?? "");
  if (!KNOWN.includes(v)) v = "home";
  if (phone ? v === "board" || v === "sources" : v === "chat" || v === "device") v = "home";
  return v as View;
}
export const viewOf = (search: string, phone: boolean) => resolveView(new URLSearchParams(search).get("view"), phone);
// The view a page opens on. Only the board's own address names a view, wherever the board is served (at "/" or under a
// prefix): the Notebook page (<html data-kit>) lights the Board icon, as it always did.
export const startView = (search: string, phone: boolean, notebook: boolean): View =>
  notebook ? "board" : viewOf(search, phone);

// The classes on <body> that show one page area and its header buttons (web/ui/legacy/board.css keys on them).
export function bodyClasses(v: View, phone: boolean) {
  const ph = phone && v === "home";
  return {
    paged: v !== "board",
    ice: v === "sources",
    setv: v === "settings",
    termv: v === "terminal",
    homev: (v === "home" && !ph) || v === "chat",
    phomev: ph || v === "device",
    pdevv: v === "device",
    taskv: v === "tasks",
    taskpagev: v === "task",
    runv: v === "run",
  };
}
// The address a view has when it is opened from the menu (a run and a task push their own).
export const urlFor = (v: View, pathname: string) =>
  v === "home" ? pathname : "?view=" + (v === "sources" ? "icebox" : v);
// The side menu item that is lit and the header's title for a view (a task, and a phone's run workspace, belong to Tasks).
export const litItem = (v: View, phone: boolean) => (v === "task" || (v === "run" && phone) ? "tasks" : v);
const TITLES: Record<string, string> = {
  sources: "Icebox",
  tasks: "Tasks",
  task: "Task",
  run: "Run",
  terminal: "Terminal",
  chat: "Chat",
  device: "Tasks",
};
// Home reads Chat on a computer and shows the wordmark on a phone (the header's title is the logo there).
export const viewTitle = (v: View, phone: boolean) =>
  v === "home" ? (phone ? "kaizen" : "Chat") : (TITLES[v] ?? "Board");
// The pages that are drawn the first time they open and kept after; and the React page the core stores call it.
export const pageSeen = (v: View, phone: boolean) =>
  v === "tasks"
    ? "tasks"
    : v === "task"
      ? "task"
      : v === "sources"
        ? "icebox"
        : (v === "home" && !phone) || v === "chat"
          ? "home"
          : "";
export type Page = "tasks" | "task" | "icebox" | "";
export const pageOf = (v: View): Page =>
  v === "tasks" ? "tasks" : v === "task" ? "task" : v === "sources" ? "icebox" : "";
// The run a ?view=run (or ?view=ws) address names: a workspace by folder and path, a run by id, a task by its text.
export type RunRoute = { dir: string; ws?: string; id?: string; idea?: string };
export function runOf(search: string): RunRoute | null {
  const p = new URLSearchParams(search);
  if (p.get("view") !== "run" && p.get("view") !== "ws") return null;
  const dir = p.get("dir");
  if (!dir) return null;
  return {
    dir,
    ...(p.get("ws") ? { ws: p.get("ws")! } : {}),
    ...(p.get("id") ? { id: p.get("id")! } : {}),
    ...(p.get("idea") !== null ? { idea: p.get("idea")! } : {}),
  };
}

// A link from a note (?run= or ?idea=, with dir, tab, item) names a card to open in the panel, on one of its tabs, a finding or
// backlog item marked. null: the address is not one (a workspace address, ?view=run&idea=, is the run view's own). An item's
// tab is its own when the link names none; `work` is the Work tab's old name.
export type Deep = {
  dir: string | null;
  run: string | null;
  idea: string | null;
  tab: string;
  item: { type: "finding" | "backlog"; n: number } | null;
};
export function deepOf(search: string): Deep | null {
  const p = new URLSearchParams(search),
    run = p.get("run"),
    idea = p.get("idea");
  if ((!run && idea === null) || p.get("view") === "run") return null;
  const m = /^(finding|backlog)-(\d+)$/.exec(p.get("item") || ""),
    n = p.get("tab") || (m ? (m[1] === "finding" ? "review" : "backlog") : "");
  return {
    dir: p.get("dir"),
    run,
    idea,
    tab: n === "work" ? "impl" : n,
    item: m ? { type: m[1] as "finding" | "backlog", n: +m[2]! } : null,
  };
}
