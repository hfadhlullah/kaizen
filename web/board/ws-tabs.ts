// The workspace centre's logic without the DOM, so it is tested alone (ws-tabs.test.ts):
// which runs the panel's picker lists, which are History, how stage terminals are named, and
// how the old per-run tab layouts move to their workspace.
// A screen's layout is a tmux-style tree (lib/run/layout.ts, no DOM there); re-exported so the board code and its
// tests keep their imports.
import { gitDue } from "@lib/rail/rules.ts";
import { leaves, prune, type Node } from "@lib/run/layout.ts";
export { leaves, nearestPane, prune, type Box, type Node } from "@lib/run/layout.ts";

// A workspace's key in the saved tab layouts (localStorage kz-runtabs).
export const wsKey = (dir: string, ws: string) => `ws:${dir}:${ws}`;
// A run that is over: abandoned, or done and neither waiting on an approval nor on its commit. It is History.
export const finished = (c) => c.kind === "run" && (c.status === "abandoned" || (c.status === "done" && c.accept !== "needs" && !gitDue(c)));
const here = (c, dir: string, ws: string, wsOfCard) => c.state === dir && wsOfCard(c) === ws;
// The cards whose agent terminals get tabs in a workspace: runs not over, and tasks whose agent is open.
export const liveIn = (cards: any[], dir: string, ws: string, wsOfCard) =>
  cards.filter((c) => !c.archived && here(c, dir, ws, wsOfCard) && (c.kind === "idea" ? !!c.pty : c.kind === "run" && !finished(c)));
// History: the workspace's finished runs, newest first.
export const historyOf = (cards: any[], dir: string, ws: string, wsOfCard) =>
  cards.filter((c) => finished(c) && here(c, dir, ws, wsOfCard)).sort((a, b) => (b.moved ?? 0) - (a.moved ?? 0));

type Saved = { tabs: any[]; hidden: string[]; screens: { id: string; tree: Node; focus: string }[]; on: string | null };
// Moves each card's old saved layout (keyed by the card) to its workspace's key. A key no
// card on the board owns is left as it is. Returns whether anything moved.
export function migrate(all: Record<string, Saved>, cards: any[], keyOf: (c) => string, wsOfCard): boolean {
  let moved = false;
  for (const c of cards) {
    const old = keyOf(c),
      from = all[old];
    if (!from) continue;
    const to = (all[wsKey(c.state, wsOfCard(c))] ||= { tabs: [], hidden: [], screens: [], on: null });
    const placed = new Set(to.screens.flatMap((s) => leaves(s.tree)));
    for (const t of from.tabs ?? []) if (!to.tabs.some((x) => x.id === t.id)) to.tabs.push(t);
    for (const h of from.hidden ?? []) if (!to.hidden.includes(h)) to.hidden.push(h);
    // An item sits in one screen only: a leaf the workspace already shows is dropped here.
    for (const s of from.screens ?? []) {
      const tree = s.tree && prune(s.tree, (id) => !placed.has(id));
      if (!tree) continue;
      leaves(tree).forEach((id) => placed.add(id));
      to.screens.push({ ...s, tree, focus: leaves(tree).includes(s.focus) ? s.focus : leaves(tree)[0] });
    }
    to.on ??= from.on;
    delete all[old];
    moved = true;
  }
  return moved;
}

// A run that waits on the user (an approval, a question, a done run to accept).
export const awaiting = (c) => c.kind === "run" && (c.status === "waiting" || (c.status === "done" && c.accept === "needs") || gitDue(c) || !!(c.pty?.alive && c.pty.asking));
// The panel's picker: the workspace's runs not over (waiting on you first, then the newest), as the
// sidebar count shows them.
export const pickable = (cards: any[], dir: string, ws: string, wsOfCard) =>
  liveIn(cards, dir, ws, wsOfCard)
    .filter((c) => c.kind === "run")
    .sort((a, b) => +awaiting(b) - +awaiting(a) || (b.moved ?? 0) - (a.moved ?? 0));
// The run the panel shows: the one picked while it is still pickable or History, else the first
// waiting/newest, else none.
export const chosen = (live: any[], hist: any[], picked?: string | null, keyOf: (c) => string = (c) => c.id) =>
  [...live, ...hist].find((c) => keyOf(c) === picked) ?? live[0] ?? null;
// A run the picker lists that this visit has not seen yet: it was just created.
export const newRun = (live: any[], seen: Set<string>, keyOf: (c) => string = (c) => c.id) => live.find((c) => !seen.has(keyOf(c)));

// The terminal the board launched for each stage of a run: plan/impl/review sub-tab -> pty key.
// plan, impl and review are recorded when the board launches them (the task's agent once its run
// exists, /decide, /fix). A plan that was not recorded falls back to the session no stage claims,
// and only until a later stage has been launched.
export function stageKeys(c): Record<string, string> {
  if (c?.kind !== "run") return {};
  const all: string[] = c?.pty?.all ?? [],
    st = c?.pty?.stages ?? {},
    out: Record<string, string> = {};
  for (const s of ["explore", "impl", "review"]) if (st[s] && all.includes(st[s])) out[s] = st[s];
  if (st.plan && all.includes(st.plan)) out.plan = st.plan;
  // Fallback for a terminal the board did not record (a run it did not start): the lone unclaimed agent
  // is named by the run's current stage (column 1 plan, 2 build, 3 review); at any other point it stays plain.
  const first = all.find((k) => !Object.values(st).includes(k)),
    now = c.stage === "explore" ? "explore" : { 1: "plan", 2: "impl", 3: "review" }[c.column as number];
  if (first && now && !Object.keys(st).length) out[now] = first;
  return out;
}

// A run's terminals as centre tabs: those a stage claimed are named "Plan · Claude", "Build · Claude",
// "Review · Claude"; the rest keep the agent's name, numbered when there are several.
export function stageTabs(c, agent: string): { key: string; title: string }[] {
  const word = { explore: "Explore", plan: "Plan", impl: "Build", review: "Review" },
    all: string[] = c?.pty ? c.pty.all ?? [c.pty.key] : [],
    by = new Map(Object.entries(stageKeys(c)).map(([s, k]) => [k, word[s]])),
    free = all.filter((k) => !by.has(k)),
    now = c?.stage === "explore" ? "Explore" : word[{ 1: "plan", 2: "impl", 3: "review" }[c?.column as number] ?? ""],
    last = all.at(-1);
  // One terminal can carry several stages: the newest staged one is named for where the run is now.
  if (now && last && by.has(last)) by.set(last, now);
  return all.map((key) => ({ key, title: by.has(key) ? `${by.get(key)} · ${agent}` : agent + (free.length > 1 ? " " + (free.indexOf(key) + 1) : "") }));
}

// A run at review or done: its localhost Preview may open the Browser.
export const reviewing = (c) => c.kind === "run" && (c.column === 3 || c.status === "done");
// The first localhost address in a run's ## Preview.
export const loopbackUrl = (pv?: string | null) => (pv ? /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?[^\s)`'"<>]*/.exec(pv)?.[0] : undefined);
// The address the Browser opens for a run: the Preview's first localhost address on a port the
// workspace's own processes listen on (`ports`, from /devports), else the first such port, else
// the Preview's first address. Another project on the Preview's port never wins.
// ponytail: with no Preview match the lowest port wins, which may be an asset server (Vite) over the app.
export function devUrl(pv: string | null | undefined, ports: number[]): string | undefined {
  const all = pv ? [...pv.matchAll(/https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?[^\s)`'"<>]*/g)].map((m) => m[0]) : [];
  const portOf = (u: string) => Number(new URL(u).port || 80);
  return all.find((u) => ports.includes(portOf(u))) ?? (ports.length ? `http://localhost:${ports[0]}` : all[0]);
}
// Runs that moved into review or done since the last tick (`was` = the keys reviewing then) and have not
// yet opened the Browser: once per run id (`seen`).
export const toOpen = (cards: any[], was: Set<string>, seen: string[], keyOf: (c) => string) => cards.filter((c) => reviewing(c) && !was.has(keyOf(c)) && !seen.includes(keyOf(c)));

// `kaizen preview` written from folder `pws` belongs to workspace `ws`: the same folder or one inside
// it, but never a worktree under it (`.kaizen/wt/`), which is a workspace of its own.
export const previewIn = (pws: string, ws: string) => pws === ws || (pws.startsWith(ws + "/") && !pws.startsWith(ws + "/.kaizen/wt/"));
// A preview opens a tab only when written after the last one this visit recorded; the first look at
// a workspace (`last` undefined: a click, a switch, a reload) only records.
export const previewOpens = (at: number, last: number | undefined) => last !== undefined && at > last;

// The sidebar card's agents, the project drag's moveTo and gitDue moved to lib/rail (no DOM there); re-exported so the run view and its tests keep their imports.
export * from "@lib/rail/agents.ts";
export { moveTo, gitDue, dueWord } from "@lib/rail/rules.ts";
export { branchSlug } from "@lib/project/branch.ts";
