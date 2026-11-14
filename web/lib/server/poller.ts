// The one poller: reads /state (and the reads that hang off it) and writes the server store. The board's engines hear of a
// new /state through `setEngine` (the cards' redraw, notifications, the open panel); nothing else reads the server to share it.
import { toast } from "@lib/core";
import { homeShows, useRoute } from "@lib/router";
import { BADGE_GAP, quietDelay, skipRedraw, SOURCES_GAP, TASKS_GAP, numberKeys, withoutClock } from "./poll-rules.ts";
import { getServer, onServer, setServer, type Every } from "./server-store.ts";

// This page's project, sent with each request: the server keeps none, so another tab or a phone picking a project never
// moves this one.
export const dirHeader = () => {
  const { dir } = getServer();
  return dir ? { "x-kz-dir": dir } : {};
};
// A tab outliving its server would otherwise swallow every click: say so.
const GONE = "The kaizen server is not running — start it with kaizen web (or the shortcut), then reload.";

// What the board does with a new /state besides storing it (the cards' redraw, notifications, the open panel).
type Engine = (next: any, prev: any, quiet: boolean) => Promise<void> | void;
let engine: Engine = () => {};
export const setEngine = (f: Engine) => (engine = f);

const everyOf = (s: any): Every => ({
  cards: s.cards,
  projects: [...s.projects, ...(s.rail ?? [])],
  agents: s.agents ?? [],
});
let generation = 0; // a newer all-projects snapshot makes a read still in flight stale
function publish(every: Every, rest: object = {}) {
  generation++;
  setServer({ every, ...rest });
}

// ---- /state
let latest = 0,
  lastBody = "",
  drawnAt = 0,
  lastQuiet = 0,
  quietTimer: ReturnType<typeof setTimeout> | 0 = 0;
const runQuiet = () => {
  quietTimer = 0;
  lastQuiet = Date.now();
  return read(true);
};
// quiet: the server said something changed, nobody asked for a redraw. A change event can come several times a second while
// agents work and a full read and redraw blocks this thread (and any terminal in it): one quiet load per gap, the last change
// always covered, a hidden tab only watching for agents asking.
export function load(quiet?: boolean) {
  if (!quiet) return read(false);
  if (!quietTimer) quietTimer = setTimeout(runQuiet, quietDelay(Date.now(), lastQuiet, document.hidden));
}
// Back on a hidden tab: what it put off is shown now.
export function flushLoad() {
  if (!document.hidden && quietTimer) {
    clearTimeout(quietTimer);
    void runQuiet();
  }
}
async function read(quiet: boolean) {
  const current = ++latest,
    all = getServer().all;
  let r: Response;
  try {
    r = await fetch("/state" + (all ? "?all=1" : ""), { headers: dirHeader() });
  } catch {
    toast(GONE);
    return;
  }
  const text = await r.text();
  if (current !== latest) return;
  const body = withoutClock(text);
  const same = skipRedraw(quiet, body, lastBody, Date.now(), drawnAt);
  lastBody = body;
  if (same) {
    if (!all) void refreshEvery();
    return;
  }
  drawnAt = Date.now();
  const next = JSON.parse(text),
    prev = getServer().state;
  numberKeys(next.cards);
  if (all) publish(everyOf(next), { state: next, loaded: true });
  else {
    setServer({ state: next, loaded: true });
    void refreshEvery();
  }
  await engine(next, prev, quiet);
}

// ---- every project's cards (the side menu, the Terminal page, the tab title): the state itself when the page shows all
// projects, else one more read, at most one per BADGE_GAP, the last request still served when the gap ends.
let lastAll = "",
  loading = false,
  again = false,
  lastRun = 0,
  waiting: ReturnType<typeof setTimeout> | undefined;
export async function refreshEvery() {
  if (loading) {
    again = true;
    return;
  }
  const gap = lastRun + BADGE_GAP - Date.now();
  if (gap > 0) {
    waiting ??= setTimeout(() => {
      waiting = undefined;
      void refreshEvery();
    }, gap);
    return;
  }
  lastRun = Date.now();
  loading = true;
  do {
    again = false;
    const current = generation;
    try {
      const r = await fetch("/state?all=1");
      if (!r.ok) continue;
      const text = await r.text();
      const body = withoutClock(text);
      if (body === lastAll) continue;
      if (!again && current === generation) {
        lastAll = body;
        const s = JSON.parse(text);
        publish(everyOf(s));
      }
    } catch {
      /* keep the last count while the board is offline */
    }
  } while (again);
  loading = false;
}

// ---- the reads that follow a new all-projects snapshot
let tasksAt = 0,
  tasksReading = false;
export async function readTasks() {
  if (tasksReading || Date.now() - tasksAt < TASKS_GAP) return;
  tasksReading = true;
  tasksAt = Date.now();
  try {
    const r = await fetch("/tasks?all=1");
    if (r.ok) setServer({ tasks: (await r.json()).tasks ?? [] });
  } catch {
    /* retain the latest persisted projection */
  } finally {
    tasksReading = false;
  }
}
let sourcesAt = 0;
export async function readSources(force = false) {
  if (!force && Date.now() - sourcesAt < SOURCES_GAP) return;
  sourcesAt = Date.now();
  try {
    const r = await fetch("/sources");
    if (r.ok) setServer({ sources: await r.json() });
  } catch {
    /* offline: keep what shows */
  }
}
export async function readShells() {
  try {
    setServer({ shells: await (await fetch("/shells")).json() });
  } catch {
    /* keep what shows */
  }
}
// The side menu's live parts (task and Icebox counts, source marks) and, on the board, the footer's terminal count follow
// each all-projects snapshot. The Notebook starts this too; Video lists no projects. Returns the function that stops it.
export function startRailFeed(withShells = false) {
  void readTasks();
  return onServer(
    (s) => s.every,
    () => {
      void readSources();
      void readTasks();
      if (withShells) void readShells();
    },
  );
}

// ---- the event stream: a change reloads the board quietly; a new server start reloads the page
let boot: string | null = null,
  pendingReload = false;
// Home's chat holds a stream the person is reading: a reload waits until they leave it.
const reloadWhenAway = () => (homeShows() ? (pendingReload = true) : location.reload());
function listen() {
  const es = new EventSource("/events");
  es.onmessage = (ev) => {
    if (ev.data === "changed") {
      load(true);
      setServer((s) => ({ changed: s.changed + 1 }));
    } else if (ev.data.startsWith("hello ")) {
      const b = ev.data.slice(6);
      if (boot && b !== boot) reloadWhenAway();
      boot = b;
    }
  };
  es.onerror = () => {
    es.close();
    setTimeout(listen, 3000);
  };
}
export function startEvents() {
  useRoute.subscribe((r, p) => r.view !== p.view && pendingReload && !homeShows() && location.reload());
  // Back from a terminal: what was committed or pushed there touched nothing the server watches.
  addEventListener("focus", () => load(true));
  addEventListener("visibilitychange", flushLoad);
  listen();
}
