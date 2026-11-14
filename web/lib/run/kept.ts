// Which workspaces keep their panes mounted (hidden) once visited, and when one goes. No DOM, tested alone (kept.test.ts).
// A kept workspace holds every pane it had (terminals, the Browser frame, notes iframes, History, Preview), so leaving it for
// another page and coming back keeps a frame's page, scroll and typed text and a terminal's screen. Each terminal holds a
// 5000-line scrollback and a WebGL context, and Chrome keeps about 16 contexts, dropping the oldest, so the hidden ones are
// capped: the shown workspace always stays, then the most recently visited ones while both limits hold. A workspace over
// the limit is unmounted and made again on return (/pty replays a session on attach; a frame loads its address again).
import type { RvPane } from "./run-view-store.ts";

export type KeptWs = { items: RvPane[]; ws: { dir: string; ws: string } };
export type Kept = Record<string, KeptWs>;
export const KEEP_WORKSPACES = 4; // the shown one and the three visited most recently before it
export const KEEP_TERMINALS = 12; // under the ~16 WebGL contexts one page gets, with room for the Terminal page and in-card ones
export const isTerm = (i: Pick<RvPane, "kind">) => i.kind === "agent" || i.kind === "shell";
export const termsIn = (v: KeptWs) => v.items.filter(isTerm).length;

// `recent`: workspace keys, least recently shown first. Showing one moves it to the end.
export const touch = (recent: string[], k: string) => [...recent.filter((x) => x !== k), k];

// The keys to keep: the shown workspace, then the most recent others while the workspace and terminal counts fit. A
// workspace that does not fit ends the walk, so a recent one is never dropped for an older, smaller one.
export function keepKeys(kept: Kept, recent: string[], shown: string | null, caps = { workspaces: KEEP_WORKSPACES, terminals: KEEP_TERMINALS }): Set<string> {
  const keep = new Set<string>();
  let terms = 0;
  if (shown && kept[shown]) (keep.add(shown), (terms += termsIn(kept[shown]!)));
  const order = [...Object.keys(kept).filter((k) => !recent.includes(k)), ...recent].filter((k) => k !== shown && kept[k]).reverse();
  for (const k of order) {
    if (keep.size >= caps.workspaces || terms + termsIn(kept[k]!) > caps.terminals) break;
    keep.add(k);
    terms += termsIn(kept[k]!);
  }
  return keep;
}
// `kept` without the workspaces over the cap (the same object when nothing goes).
export function evict(kept: Kept, recent: string[], shown: string | null, caps?: { workspaces: number; terminals: number }): Kept {
  const keep = keepKeys(kept, recent, shown, caps);
  if (Object.keys(kept).every((k) => keep.has(k))) return kept;
  return Object.fromEntries(Object.entries(kept).filter(([k]) => keep.has(k)));
}

// Session keys that are alive: the shells, the agents the board lists, and every pty of every card.
export const liveKeys = (shells: { key: string }[], agents: { key: string }[], cards: any[]) =>
  new Set<string>([...shells.map((x) => x.key), ...agents.map((a) => a.key), ...cards.flatMap((c) => (c.pty ? [c.pty.key, ...(c.pty.all ?? [])] : []))]);
// A kept terminal whose session is gone (it ended, or its tab was closed in another window) is unmounted; the shown
// workspace is left to its own redraw. Only terminals carry a session key, so every other pane stays. Same object when
// nothing goes.
export function pruneDead(kept: Kept, live: Set<string>, shown: string | null): Kept {
  let changed = false;
  const next = Object.fromEntries(
    Object.entries(kept).map(([k, v]) => {
      if (k === shown) return [k, v];
      const items = v.items.filter((i) => !isTerm(i) || !i.key || live.has(i.key));
      if (items.length === v.items.length) return [k, v];
      changed = true;
      return [k, { ...v, items }];
    }),
  );
  return changed ? next : kept;
}
