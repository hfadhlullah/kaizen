// A worktree run handed to a second agent: the first agent stays with the user, the board opens
// the second in the worktree, and wakes the first when it ends. Its own file, not state.json,
// because agents hand-write state.json. The wake-up carries nothing: this file and the run's
// reports are the message, so a lost one costs only the nudge.
import { closeSync, existsSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Status = "requested" | "running" | "done" | "blocked" | "failed" | "declined" | "quiet";
export type Handoff = { status: Status; parent_terminal: string; child_terminal?: string; reason?: string; at: number; woken?: boolean };
export const REQUEST_MS = 10_000;
const QUIET_TYPING_MS = 5_000;
const DRAFT_MS = 10 * 60_000; // a draft untouched this long no longer holds the wake

const file = (state: string, id: string) => join(state, "runs", id, "handoff.json");

export function readHandoff(state: string, id: string): Handoff | null {
  try { return JSON.parse(readFileSync(file(state, id), "utf8")); } catch { return null; }
}

export function writeHandoff(state: string, id: string, h: Handoff) {
  const f = file(state, id), tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(h, null, 2));
  renameSync(tmp, f);
}

// The CLI and the board both move this file, so every move holds a lock across its read and
// write and names the statuses it may leave: a stale reader changes nothing.
function locked<T>(state: string, id: string, fn: () => T): T {
  const lock = `${file(state, id)}.lock`;
  for (let i = 0; ; i++) {
    try { closeSync(openSync(lock, "wx")); break; } catch (err) {
      try { if (Date.now() - statSync(lock).mtimeMs > 5000) { const aside = `${lock}.${process.pid}.${i}.stale`; renameSync(lock, aside); rmSync(aside, { force: true }); continue; } } catch { /* just released */ }
      if (i > 500) throw err;
      Bun.sleepSync(2);
    }
  }
  try { return fn(); } finally { rmSync(lock, { force: true }); }
}

/** Moves the handoff only if it is in one of `from`. True when it moved. */
export function move(state: string, id: string, from: Status[], set: Partial<Handoff>): boolean {
  return locked(state, id, () => {
    const h = readHandoff(state, id);
    if (!h || !from.includes(h.status)) return false;
    writeHandoff(state, id, { ...h, ...set, at: Date.now() });
    return true;
  });
}

/**
 * Asks the board for the second agent. Null when this is no board terminal: build here. An
 * agent already open, or a request still live, is returned as it is: never a second one.
 */
export function request(state: string, id: string, term: string | undefined): Handoff | null {
  if (!term || !existsSync(join(state, "runs", id, "state.json"))) return null;
  return locked(state, id, () => {
    const was = readHandoff(state, id);
    if (was && (was.status === "running" || was.status === "quiet" || requestOpen(was, Date.now()))) return was;
    const h: Handoff = { status: "requested", parent_terminal: term, at: Date.now() };
    writeHandoff(state, id, h);
    return h;
  });
}

/**
 * Waits for the board to answer. No answer declines the request, so a board that comes up
 * later cannot open a second agent beside the one now building here. The decline can lose to
 * the board's claim: then the agent is open, and this says so.
 */
export async function awaitBoard(state: string, id: string, ms = REQUEST_MS, step = 200): Promise<boolean> {
  const took = (s?: Status) => s === "running" || s === "quiet" || s === "done" || s === "blocked" || s === "failed";
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const s = readHandoff(state, id)?.status;
    // A quick second agent may be finished by the time this looks: it still took the run.
    if (took(s)) return true;
    if (s !== "requested") return false;
    await Bun.sleep(step);
  }
  if (move(state, id, ["requested"], { status: "declined", reason: "no board answered" })) return false;
  return took(readHandoff(state, id)?.status);
}

/** The board's claim, made before anything launches: it loses to a decline, so no stray agent. */
export const started = (state: string, id: string, key: string) => move(state, id, ["requested"], { status: "running", child_terminal: key });
export const refused = (state: string, id: string, why: string) => move(state, id, ["requested"], { status: "declined", reason: why });

/** The second agent's last word. A repeat cannot rewrite the result; a report after `quiet` wakes the first agent again, since it is news. */
export function finish(state: string, id: string, status: "done" | "blocked", reason?: string): string | null {
  const h = readHandoff(state, id);
  if (!h) return "this run has no handoff";
  return move(state, id, ["running", "quiet"], { status, reason, woken: false }) ? null : `the handoff is ${readHandoff(state, id)!.status}, not running`;
}

/** A request the board may still act on. An old one was declined or abandoned by its asker. */
export const requestOpen = (h: Handoff | null, now: number) => h?.status === "requested" && now - h.at < REQUEST_MS;

/** A live second agent silent this long, not working or asking: it may have ended without saying so. */
export const QUIET_MS = 20 * 60_000;
export const childQuiet = (h: Handoff | null, pty: { alive: boolean; busy: boolean; asking: boolean; lastOut?: number } | null, now: number) =>
  h?.status === "running" && !!pty?.alive && !pty.busy && !pty.asking && now - (pty.lastOut ?? now) > QUIET_MS;

/** The child terminal ended without a report. */
export const childDied = (h: Handoff | null, alive: boolean) => (h?.status === "running" || h?.status === "quiet") && !alive;

type Term = { alive: boolean; busy: boolean; asking: boolean; typedAt: number; draft?: boolean } | null;
export type Wake = "wait" | "send" | "gone" | "held" | "none";

/** What to do about the first agent: send only into a live, idle terminal nobody is typing in. */
export function wakeAction(h: Handoff | null, parent: Term, now: number): Wake {
  if (!h || h.woken || !["done", "blocked", "failed", "quiet"].includes(h.status)) return "none";
  if (!parent?.alive) return "gone";
  // Unsent text in its input box: a wake would submit that draft. The card speaks instead.
  if (parent.draft && now - parent.typedAt < DRAFT_MS) return "held";
  return parent.busy || parent.asking || now - parent.typedAt < QUIET_TYPING_MS ? "wait" : "send";
}

export const wakeLine = (id: string, h: Handoff) =>
  `kaizen run ${id}: the worktree agent ended (${h.status}). Read .kaizen/runs/${id}/handoff.json, 03-impl.md and 04-review.md, then report to the user.`;

/** Marked before sending: a board restart between the two loses a nudge, never repeats one. */
export const markWoken = (state: string, id: string) => move(state, id, ["done", "blocked", "failed", "quiet"], { woken: true });
