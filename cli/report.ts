// What an agent says about its own run: runs/<id>/report.json, written by `kaizen report`.
// A file, so it works with no board up, in any tool, with no secret to hand out.
// The board reads it; a run with no report behaves exactly as before.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type Handback = { stage: string; iteration?: number; outcome: "succeeded" | "failed"; summary: string; files: string[] };
export type Report = { phase?: string; at: number; blocked?: { question: string; options: string[] }; handback?: Handback };
export type Signal = "blocked" | "stale" | "unverified" | null;

const clip = (s: unknown, n: number) => String(s ?? "").replace(/[\0-\x1f\x7f]+/g, " ").trim().slice(0, n);
const validId = (id: string) => /^[A-Za-z0-9][\w.-]{0,127}$/.test(id) && !id.includes("..");

// A worktree carries its own committed .kaizen with no runs: the project's holds them.
export const stateOf = (cwd: string, found: string | null) => /^(.*[\\/]\.kaizen)[\\/]wt[\\/]/.exec(cwd)?.[1] ?? found;

export function readReport(state: string, id: string): Report | null {
  try {
    const r = JSON.parse(readFileSync(join(state, "runs", id, "report.json"), "utf8"));
    return r && typeof r.at === "number" ? r : null;
  } catch { return null; }
}

function write(state: string, id: string, patch: (r: Report) => void): string | null {
  if (!validId(id) || !existsSync(join(state, "runs", id, "state.json"))) return `no run ${clip(id, 80)}`;
  const r = readReport(state, id) ?? { at: 0 };
  patch(r);
  r.at = Date.now();
  const file = join(state, "runs", id, "report.json"), tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(r, null, 2));
  renameSync(tmp, file);
  return null;
}

export const reportPhase = (state: string, id: string, text: string) => write(state, id, (r) => { r.phase = clip(text, 120); });
export const reportBlocked = (state: string, id: string, question: string, options: string[] = []) =>
  write(state, id, (r) => { r.blocked = { question: clip(question, 300), options: options.slice(0, 4).map((o) => clip(o, 80)) }; });
export const reportUnblock = (state: string, id: string) => write(state, id, (r) => { delete r.blocked; });
export function reportDone(state: string, id: string, stage: string, outcome: string, summary: string, files: string[]) {
  if (outcome !== "succeeded" && outcome !== "failed") return "outcome is succeeded or failed";
  let iteration = 0;
  try { iteration = Number(JSON.parse(readFileSync(join(state, "runs", id, "state.json"), "utf8")).iteration) || 0; } catch { /* write() reports it */ }
  return write(state, id, (r) => { r.handback = { stage: clip(stage, 20), iteration, outcome, summary: clip(summary, 600), files: files.slice(0, 200).map((f) => clip(f, 300)) }; delete r.blocked; });
}

// What the card shows. `pty` is the board's terminal for the run; without one the agent
// runs elsewhere, so nothing here can tell quiet from dead and no signal is given. A
// terminal that ended mid-stage is unverified, report or none, and each fix round owes its
// own hand-back.
type RunView = { stage?: string; awaiting?: string | null; iteration?: number };
type PtyView = { alive?: boolean; busy?: boolean; asking?: boolean; lastOut?: number };
export function signalOf(run: RunView, r: Report | null, pty: PtyView | undefined, now: number, minutes: number): Signal {
  if (run.stage === "done" || run.stage === "abandoned") return null;
  if (r?.blocked) return "blocked";
  if (run.awaiting || !pty) return null;
  if (!pty.alive) {
    const h = r?.handback;
    return (run.stage === "build" || run.stage === "review") && !(h?.stage === run.stage && (h.iteration ?? 0) === (run.iteration ?? 0)) ? "unverified" : null;
  }
  if (!r || pty.busy || pty.asking) return null;
  return now - Math.max(r.at, pty.lastOut ?? 0) > 2 * minutes * 60_000 ? "stale" : null;
}
