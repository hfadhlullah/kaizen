// The workspace centre's logic without the DOM, so it is tested alone (ws-tabs.test.ts):
// which runs have a tab, which are History, and how the old per-run tab layouts move to
// their workspace.
// A screen's layout is a tmux-style tree: a leaf is an item id; a split holds two or more
// children side by side ("cols") or stacked ("rows"), with their relative sizes.
export type Node = string | { dir: "cols" | "rows"; kids: Node[]; sizes: number[] };
export const leaves = (n: Node): string[] => (typeof n === "string" ? [n] : n.kids.flatMap(leaves));
// Drops ids no longer open; a split left with one child becomes that child.
export function prune(n: Node, keep: (id: string) => boolean): Node | null {
  if (typeof n === "string") return keep(n) ? n : null;
  const kids: Node[] = [],
    sizes: number[] = [];
  n.kids.forEach((k, i) => {
    const p = prune(k, keep);
    if (p) (kids.push(p), sizes.push(n.sizes[i] ?? 1));
  });
  return !kids.length ? null : kids.length === 1 ? kids[0] : { dir: n.dir, kids, sizes };
}

// A workspace's key in the saved tab layouts (localStorage kz-runtabs).
export const wsKey = (dir: string, ws: string) => `ws:${dir}:${ws}`;
// A run that is over: done and not waiting on an approval, or abandoned. It is History.
export const finished = (c) => c.kind === "run" && (c.status === "abandoned" || (c.status === "done" && c.accept !== "needs"));
const here = (c, dir: string, ws: string, wsOfCard) => c.state === dir && wsOfCard(c) === ws;
// The cards that get a tab in a workspace: runs not over, and ideas whose agent is open.
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

// A run that waits on the user (an approval, a question, a done run to accept): its tab is not closed.
export const awaiting = (c) => c.kind === "run" && (c.status === "waiting" || (c.status === "done" && c.accept === "needs") || !!(c.pty?.alive && c.pty.asking));
// Live runs whose tab was closed with ×: the + menu offers them back.
export const hiddenRuns = (live: any[], hidden: string[], keyOf: (c) => string) => live.filter((c) => c.kind === "run" && hidden.includes("rn:" + keyOf(c)));

// The terminal the board launched for each stage of a run: plan/impl/review sub-tab -> pty key.
// plan, impl and review are recorded when the board launches them (the idea's agent once its run
// exists, /decide, /fix). A plan that was not recorded falls back to the session no stage claims,
// and only until a later stage has been launched.
export function stageKeys(c): Record<string, string> {
  if (c?.kind !== "run") return {};
  const all: string[] = c?.pty?.all ?? [],
    st = c?.pty?.stages ?? {},
    out: Record<string, string> = {};
  for (const s of ["impl", "review"]) if (st[s] && all.includes(st[s])) out[s] = st[s];
  if (st.plan && all.includes(st.plan)) out.plan = st.plan;
  // Fallback for a plan the board did not record (a run it did not start): the unclaimed first agent.
  const first = all.find((k) => !Object.values(st).includes(k));
  if (!st.plan && first && !Object.keys(st).length) out.plan = first;
  return out;
}

// A run at review or done: its localhost Preview may open the Browser.
export const reviewing = (c) => c.kind === "run" && (c.column === 3 || c.status === "done");
// The first localhost address in a run's ## Preview.
export const loopbackUrl = (pv?: string | null) => (pv ? /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?[^\s)`'"<>]*/.exec(pv)?.[0] : undefined);
// Runs that moved into review or done since the last tick (`was` = the keys reviewing then) and have not
// yet opened the Browser: once per run id (`seen`).
export const toOpen = (cards: any[], was: Set<string>, seen: string[], keyOf: (c) => string) => cards.filter((c) => reviewing(c) && !was.has(keyOf(c)) && !seen.includes(keyOf(c)));
