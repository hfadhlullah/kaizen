// The side menu's Projects list without the DOM: which projects and workspaces it lists for the cards, filter, pins and
// agents it is given, what each row shows, and the rules for the project drag. Pure, so a test stands alone and the
// board's old modules can import it into the notebook bundle without React (tested in rail-rules.test.ts).
import { wsAgents, type ARow, type Agent } from "./agents.ts";
import type { RailTask } from "@lib/server";

const DAY = 864e5;
export type { RailTask } from "@lib/server";
// What the old code hands the list on every refresh (/state?all=1 and /tasks?all=1).
export type { RailData } from "@lib/server";
// The Projects filter: projects ticked (none = all) and which kinds of card show. Running: tasks and agents that started
// and are not done. Done: the finished ones. Saved tasks that never started show in neither.
export type RailFilt = { dirs: string[]; running: boolean; done: boolean };
export const ALLF: RailFilt = { dirs: [], running: true, done: false };

// A done, approved run whose commit or push is still to do (the card's git mark).
export const gitDue = (c) =>
  c.kind === "run" && c.status === "done" && c.accept !== "needs" && !c.archived && c.git === "pending";
export const dueWord = (c) => (c.gitDue === "push" ? "push" : "commit");
export const taskForCard = (c: any, tasks: RailTask[] | null) =>
  tasks?.find(
    (t) =>
      t.dir === c.state &&
      (t.id === c.taskId ||
        (c.kind === "run" &&
          [
            t.activeRun,
            ...(t.runs ?? t.runIds ?? []).map((r) => (typeof r === "string" ? r : r.id)),
            ...(t.legacy?.kind === "run" ? [t.legacy.id] : []),
          ].includes(c.id))),
  );
export const RANK = { wait: 0, plan: 1, build: 2, review: 3, stalled: 4, idle: 5, done: 6, aband: 7 };
// A card's state icon (.si) and the word under its title.
export function stateOf(c, task?: RailTask | null) {
  // Only a task that is really working spins; a saved goal is idle, a finished run keeps its own state.
  // An abandoned run waits on nobody, and a done one only on its own approval or commit (below), so
  // a linked task's "needs you" never paints a finished run orange.
  if (task && !(c.kind === "run" && (c.status === "done" || c.status === "abandoned")))
    return task.attention.category === "needs-you"
      ? "wait"
      : task.attention.category === "completed"
        ? "done"
        : ["interrupted", "failed"].includes(task.status ?? "")
          ? "stalled"
          : task.status === "draft"
            ? "idle"
            : "build";
  // A task whose agent is working is a run being born: show it as planning.
  if (c.kind === "idea") return !c.pty?.alive ? "idle" : c.pty.asking ? "wait" : c.pty.busy ? "plan" : "idle";
  if (c.status === "waiting" || (c.pty?.alive && c.pty.asking)) return "wait";
  if (c.status === "done") return c.accept === "needs" || gitDue(c) ? "wait" : "done";
  if (c.status === "abandoned") return "aband";
  if (c.status === "stalled") return "stalled";
  return c.column >= 3 ? "review" : c.column === 2 ? "build" : "plan";
}
// Shown in the list: runs not archived, a finished one only for a day. Tasks not started yet
// live on the Tasks page; one whose agent is starting (it has a terminal) shows here.
export const listed = (c, now: number) =>
  !c.archived &&
  (c.kind === "idea" ? !!c.pty : !["done", "abandoned"].includes(c.status) || now - (c.moved ?? 0) < DAY);
// A card's title: its first line.
export const titleOf = (c) => (c.title || c.text || "").split("\n")[0];
// A card's address: its run workspace (?view=run&dir=&id=, or &idea= for a task).
export const cardHref = (c) =>
  `/?view=run&dir=${encodeURIComponent(c.state)}&` +
  (c.kind === "run" ? "id=" + encodeURIComponent(c.id) : "idea=" + encodeURIComponent(c.text));
export const projName = (dir: string, projects?: any[]) => {
  const l = projects?.find((p) => p.dir === dir)?.label || dir.replace(/[\\/]\.kaizen$/, "");
  return l.split(/[\\/]/).pop() || l;
};
export const wsLabel = (w) => w.branch || (w.main ? "workspace" : w.path.split(/[\\/]/).pop());
export const folderOf = (w) => w.path.split(/[\\/]/).pop() || w.path;
// A card's workspace row: its own (a run's worktree) when the project lists it, else the main checkout's, so a run whose
// worktree is gone, a task or an old run never vanishes.
export function wsOfCard(c, projects?: any[]) {
  const ws = projects?.find((p) => p.dir === c.state)?.workspaces ?? [];
  return ws.find((w) => w.path === c.ws)?.path ?? ws.find((w) => w.main)?.path ?? c.ws ?? "";
}

export type RailRow = {
  w: any;
  path: string;
  label: string;
  folder: string;
  pinned: boolean;
  st: string; // the dot: the most urgent run there, or an agent asking (amber) or working (spinner)
  agents: ARow[];
  open: boolean;
  tasks: RailTask[];
};
export type RailGroup = {
  dir: string;
  name: string;
  git: boolean;
  mainWs: string;
  shut: boolean;
  empty: boolean;
  rows: RailRow[];
};
export const pinKey = (dir: string, ws: string) => dir + "\0" + ws;

// The groups the list draws, in the registry's order (which the user ranks by dragging a project's bar).
export function railGroups(
  d: RailData,
  o: { filt: RailFilt; pins: string[]; folded: string[]; open: Record<string, true>; now: number },
): RailGroup[] {
  const { filt, now } = o,
    pins = new Set(o.pins),
    folded = new Set(o.folded),
    tasks = d.tasks,
    wsOf = (c) => wsOfCard(c, d.projects);
  // Home (the global queue, `home`) heads the list; the rest keep the registry's order (stable sort).
  const projects = d.projects.filter((p) => p.workspaces?.length).sort((a, b) => +!!b.home - +!!a.home);
  // Cards by project and workspace: each lands on a row, the main checkout when its own is not listed.
  const by = new Map<string, any[]>();
  const shownAgents = (rs: ARow[]) => rs.filter((r) => (r.st === "done" ? filt.done : filt.running));
  const shown = (c) => {
    const st = stateOf(c, taskForCard(c, tasks));
    return (
      (filt.running && ["wait", "plan", "build", "review", "stalled"].includes(st)) ||
      (filt.done && (st === "done" || st === "aband"))
    );
  };
  const st = (c) => stateOf(c, taskForCard(c, tasks));
  for (const c of d.cards.filter((c) => listed(c, now) && shown(c))) {
    const k = c.state + "\0" + wsOf(c);
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(c);
  }
  return (
    projects
      .filter((p) => !filt.dirs.length || filt.dirs.includes(p.dir))
      .map((p) => {
        const dir = p.dir as string;
        const rows = p.workspaces
          .map((w) => {
            const cs = by.get(dir + "\0" + w.path) ?? [];
            const allCs = d.cards.filter((c) => c.state === dir && wsOf(c) === w.path && listed(c, now));
            const onlyDone = allCs.length > 0 && allCs.every((c) => ["done", "abandoned"].includes(st(c)));
            const ags = shownAgents(wsAgents(d.agents, dir, w.path, wsOf, now));
            // An empty workspace or one with a run going is active; one holding only finished runs is done.
            const keep = cs.length > 0 || ags.length > 0 || (filt.running && (w.main || !onlyDone));
            return { w, cs, ags, keep };
          })
          .filter((r) => r.keep)
          // Pinned worktrees first (a stable sort keeps the rest in git's order).
          .sort((a, b) => +pins.has(pinKey(dir, b.w.path)) - +pins.has(pinKey(dir, a.w.path)));
        return {
          dir,
          name: projName(dir, d.projects),
          git: p.workspaces.some((w) => w.branch),
          mainWs: p.workspaces?.find((w) => w.main)?.path ?? p.workspaces?.[0]?.path ?? dir,
          // A project with nothing to list stays as a collapsed header.
          shut: folded.has(dir) || !rows.length,
          empty: !rows.length,
          rows: rows.map(({ w, cs, ags }): RailRow => {
            const st0 = cs.length ? st([...cs].sort((a, b) => RANK[st(a)] - RANK[st(b)])[0]) : "";
            return {
              w,
              path: w.path,
              label: wsLabel(w),
              folder: folderOf(w),
              pinned: pins.has(pinKey(dir, w.path)),
              st:
                st0 === "wait" || ags[0]?.st === "asking"
                  ? "wait"
                  : ags.some((r) => r.st === "working")
                    ? "build"
                    : st0 || (ags.length ? "done" : ""),
              agents: ags,
              open: !!o.open[pinKey(dir, w.path)],
              tasks: taskLinks(tasks, dir, w, cs, filt),
            };
          }),
        };
      })
      // Running only keeps every project listed, so an idle one reads "Nothing running" rather than vanishing.
      .filter((g) => g.rows.length || filt.running)
  );
}
// The Tasks that hang under a workspace row: not finished, not drafts, owned by a run listed there (or, on the main row,
// started with no run yet).
function taskLinks(tasks: RailTask[] | null, dir: string, w: any, cards: any[], filt: RailFilt): RailTask[] {
  return (tasks ?? [])
    .filter(
      (t) =>
        t.dir === dir &&
        !t.legacy &&
        t.attention.category !== "completed" &&
        filt.running &&
        t.status !== "draft" &&
        (cards.some((c) => taskForCard(c, tasks)?.id === t.id) || (w.main && !(t.runs ?? t.runIds ?? []).length)),
    )
    .sort((a, b) => (a.created ?? 0) - (b.created ?? 0));
}
export const taskDot = (t: RailTask) =>
  t.attention.category === "needs-you"
    ? "wait"
    : t.attention.category === "completed"
      ? "done"
      : ["interrupted", "failed"].includes(t.status ?? "")
        ? "stalled"
        : t.status === "draft"
          ? "idle"
          : "build";

// The filter button is lit when it narrows the list: a project ticked that exists, or a kind turned off or on.
export const filterOn = (filt: RailFilt, dirs: string[]) =>
  filt.dirs.some((d) => dirs.includes(d)) || !filt.running || filt.done;
export const matchProjects = (dirs: string[], nameOf: (d: string) => string, q: string) =>
  dirs.filter((d) => nameOf(d).toLowerCase().includes(q.toLowerCase()));
// The status chips of a workspace row's agents, most urgent first.
export const chipGroups = (rows: ARow[]) =>
  (["conflict", "failed", "asking", "working", "done"] as const)
    .map((st) => ({ st, rs: rows.filter((r) => r.st === st) }))
    .filter((g) => g.rs.length);

// The workspace the address names (the row to light): ?ws=, else the workspace of the run ?id= names.
export function currentWs(search: string, cards: any[], projects?: any[]): { dir: string | null; ws: string | null } {
  const cur = new URLSearchParams(search);
  const c =
    cur.get("id") && cards.find((x) => x.kind === "run" && x.state === cur.get("dir") && x.id === cur.get("id"));
  return { dir: cur.get("dir"), ws: cur.get("ws") ?? (c ? wsOfCard(c, projects) : null) };
}

// The list with the item at `from` moved into slot `to` (0 = top, list.length = the end), counted
// before the move: the sidebar's project drag lands it where its drop line was drawn.
export const moveTo = <T>(list: T[], from: number, to: number): T[] => {
  const out = list.filter((_, i) => i !== from);
  out.splice(to > from ? to - 1 : to, 0, list[from]);
  return out;
};
// The slot a dragged project lands in: before the first project whose bar's middle is below the pointer, else the end.
export const landingSlot = (boxes: { top: number; height: number }[], y: number) => {
  const i = boxes.findIndex((r) => y < r.top + r.height / 2);
  return i < 0 ? boxes.length : i;
};
// The new order after dropping `dir` into slot `to`, or null when it would not move.
export function rankedOrder(dirs: string[], dir: string, to: number): string[] | null {
  const from = dirs.indexOf(dir);
  return from >= 0 && to !== from && to !== from + 1 ? moveTo(dirs, from, to) : null;
}
