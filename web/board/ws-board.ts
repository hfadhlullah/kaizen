// The Workspaces board's logic without the DOM, so it is tested alone (ws-board.test.ts):
// which of Todo / In progress / In review / Done a workspace sits in, from its runs.
import { finished } from "./ws-tabs.ts";

export const WS_COLS = ["Todo", "In progress", "In review", "Done"];
// A workspace's column from its runs (ideas never move it). Archived runs still count as
// finished ones, so a workspace whose newest run is done stays Done until a new run starts.
// Returns the open runs (not finished, not archived) and the newest finished run, for the card.
export function columnOf(cards: any[], dir: string, ws: string, wsOfCard, stateOf) {
  const runs = cards.filter((c) => c.kind === "run" && c.state === dir && wsOfCard(c) === ws);
  const open = runs.filter((c) => !c.archived && !finished(c));
  const last = runs.filter(finished).sort((a, b) => (b.moved ?? 0) - (a.moved ?? 0))[0];
  const st = open.map(stateOf);
  const col = st.some((s) => s === "wait" || s === "review") ? 2 : open.length ? 1 : last?.status === "done" ? 3 : 0;
  return { col, open, last };
}
// One entry per workspace of each project; cards of a project the rail does not list yet
// get one entry per workspace they name, so the board is not empty before the rail arrives.
export function groupWs(cards: any[], projects: any[], wsOfCard) {
  const out: { dir: string; w: { path: string; branch?: string; main?: boolean }; cs: any[] }[] = [];
  const listed = new Map<string, Set<string>>();
  for (const p of projects ?? []) {
    if (!p.workspaces?.length) continue;
    listed.set(p.dir, new Set(p.workspaces.map((w) => w.path)));
    for (const w of p.workspaces) out.push({ dir: p.dir, w, cs: cards.filter((c) => c.state === p.dir && wsOfCard(c) === w.path) });
  }
  for (const c of cards) {
    const paths = listed.get(c.state);
    let path = wsOfCard(c);
    if (paths?.has(path)) continue;
    // A card matching no listed workspace (wsOfCard gave "") goes to the main checkout, else its own row.
    if (paths) path = projects.find((p) => p.dir === c.state).workspaces.find((w) => w.main)?.path ?? path;
    let e = out.find((x) => x.dir === c.state && x.w.path === path);
    if (!e) out.push((e = { dir: c.state, w: { path, main: true }, cs: [] }));
    e.cs.push(c);
  }
  return out;
}
// The words under a workspace card: a run waiting on the user says so, with what it waits for
// ("waiting on you · plan approval"); otherwise the run's own line.
export function cardLine(lead: any, leadState: string, sub: string) {
  if (!lead) return "no runs";
  if (leadState !== "wait" || lead.kind !== "run") return sub;
  return lead.status === "waiting" && sub.includes(" · ") ? `waiting on you · ${sub.split(" · ").slice(1).join(" · ")}` : "waiting on you";
}
