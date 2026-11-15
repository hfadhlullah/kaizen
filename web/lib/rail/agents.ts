// The agents of the side menu's workspace rows, without the DOM (tested in ws-tabs.test.ts and rail-rules.test.ts): which
// status each open agent terminal shows (held at "working" for a moment after the output stops), and which agents a
// workspace row lists. Pure, so the board's old modules can import it into the notebook bundle without React.
import type { Agent } from "@lib/server";
export type { Agent };
export type Status = "conflict" | "failed" | "asking" | "working" | "done";
// Output flickers: entering "working" is immediate, leaving it for "done" waits this long after the last busy tick.
export const SETTLE_MS = 3000;
const seenBusy = new Map<string, number>(); // pty key + start time -> when it was last seen busy
const id = (a: Agent) => a.key + "@" + (a.born ?? 0); // a restarted pty under the same key is a new agent
const ORDER: Record<Status, number> = { conflict: 0, failed: 0, asking: 0, working: 1, done: 2 };
export const WORD: Record<Status, string> = {
  conflict: "Conflict",
  failed: "Land failed",
  asking: "Asking",
  working: "Working",
  done: "Done",
};
export const DOT: Record<Status, string> = {
  conflict: "fail",
  failed: "fail",
  asking: "wait",
  working: "build",
  done: "done",
}; // the .si icons
// asking comes first and is immediate both ways (the server already waits for the screen to settle).
export function agentStatus(a: Agent, now: number, seen = seenBusy): Status {
  if (a.land) return a.land === "conflict" ? "conflict" : "failed";
  if (a.asking) return "asking";
  if (a.busy) return (seen.set(id(a), now), "working");
  return now - (seen.get(id(a)) ?? -Infinity) < SETTLE_MS ? "working" : "done";
}
// Milliseconds until an agent now held at "working" may turn "done" (to redraw then); Infinity when none is.
export const settleIn = (as: Agent[], now: number, seen = seenBusy) =>
  Math.min(
    Infinity,
    ...as
      .filter((a) => !a.asking && !a.busy && seen.has(id(a)))
      .map((a) => SETTLE_MS - (now - seen.get(id(a))!))
      .filter((x) => x > 0),
  );
// Forgets agents that are gone, so the memory stays as small as the open agents.
export const forgetAgents = (as: Agent[], seen = seenBusy) => {
  const live = new Set(as.map(id));
  for (const k of seen.keys()) if (!live.has(k)) seen.delete(k);
};
export type ARow = { a: Agent; st: Status };
// The agents of one workspace (the card's `ws` resolved as the rows resolve it), asking first, then working, then done.
export const wsAgents = (as: Agent[], dir: string, ws: string, wsOf, now: number, seen = seenBusy): ARow[] =>
  as
    .filter((a) => a.dir === dir && wsOf({ state: a.dir, ws: a.ws }) === ws)
    .map((a) => ({ a, st: agentStatus(a, now, seen) }))
    .sort((x, y) => ORDER[x.st] - ORDER[y.st]);
// An expanded card's row text: the agent's latest output line, else the status and the agent.
export const lineOf = ({ a, st }: ARow) => (a.land ? "" : a.last) || `${WORD[st]} - ${a.name}`;
// Expanded cards, remembered per workspace (localStorage kz-wsopen): the map of dir\0ws to true.
export const openKey = (dir: string, ws: string) => dir + "\0" + ws;
export function toggleOpen(m: Record<string, true>, dir: string, ws: string) {
  const k = openKey(dir, ws);
  if (m[k]) delete m[k];
  else m[k] = true;
  return m;
}
