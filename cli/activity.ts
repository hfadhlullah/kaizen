// Live build activity: what a Claude Code agent really does, reported by the harness and not by the agent. Claude runs this file as a
// hook on every tool call (settings in runHooksFile, cli/state.ts); it appends one short line to <project>/.kaizen/activity/<session>.jsonl.
// The board reads that file for the run that owns the session (state.json `session`) and shows "Now: …" under the build checklist.
// It must stay tiny and never fail the agent: every error is swallowed and the exit code is always 0.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";

export type Act = { t: number; tool: string; text: string };

const one = (s: unknown, n = 90) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
// A command can carry a secret; what the board shows is cut at the usual shapes.
const redact = (s: string) => s.replace(/\b[\w-]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD)[\w-]*=\S+/gi, "[hidden]").replace(/\b(Bearer|Basic)\s+\S+/gi, "$1 [hidden]");
const rel = (p: unknown, cwd: string) => {
  const f = String(p ?? "");
  const r = isAbsolute(f) && cwd ? relative(cwd, f) : f;
  return one(r && !r.startsWith("..") ? r : f, 80);
};

// One hook payload as the line the board shows, or null when it is not worth one. Pre: what starts now. Post: only a finished test run.
export function summarize(p: any, now = Date.now()): Act | null {
  const tool = String(p?.tool_name ?? ""),
    i = p?.tool_input ?? {},
    cwd = String(p?.cwd ?? "");
  if (!tool) return null;
  if (p?.hook_event_name === "PostToolUse") {
    if (tool !== "Bash") return null;
    const out = String(p?.tool_response?.stdout ?? ""),
      pass = out.match(/^\s*(\d+) pass\b/m),
      fail = out.match(/^\s*(\d+) fail\b/m);
    return pass && fail ? { t: now, tool, text: `Tests: ${pass[1]} pass, ${fail[1]} fail` } : null;
  }
  const text =
    tool === "Read" ? `Reading ${rel(i.file_path, cwd)}`
    : tool === "Edit" || tool === "MultiEdit" ? `Editing ${rel(i.file_path, cwd)}`
    : tool === "Write" ? `Writing ${rel(i.file_path, cwd)}`
    : tool === "NotebookEdit" ? `Editing ${rel(i.notebook_path, cwd)}`
    : tool === "Bash" ? `Running: ${redact(one(i.description || i.command))}`
    : tool === "Grep" || tool === "Glob" ? `Searching: ${redact(one(i.pattern))}`
    : tool === "Agent" || tool === "Task" ? `Delegating: ${one(i.description)}`
    : tool === "WebFetch" || tool === "WebSearch" ? `Looking up: ${one(i.query || i.url)}`
    : tool === "Skill" ? `Skill: ${one(i.skill)}`
    : tool;
  return { t: now, tool, text };
}

// The project's .kaizen folder for a working directory: the nearest one up the tree that keeps runs.
export function kaizenDirOf(cwd: string): string | null {
  for (let d = cwd; d && d !== dirname(d); d = dirname(d)) if (existsSync(join(d, ".kaizen", "runs"))) return join(d, ".kaizen");
  return null;
}

const KEEP = 100, BIG = 40_000, STALE = 14 * 864e5;
export const activityFile = (kz: string, session: string) => join(kz, "activity", `${session.replace(/[^\w-]/g, "")}.jsonl`);

// Appends one line; the file is cut to its last KEEP lines past BIG bytes, and a new session's file clears out the old ones.
export function record(p: any, now = Date.now()) {
  const a = summarize(p, now),
    kz = kaizenDirOf(String(p?.cwd ?? "")),
    sid = String(p?.session_id ?? "");
  if (!a || !kz || !sid) return;
  const file = activityFile(kz, sid);
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    for (const f of readdirSync(dirname(file))) try { if (now - statSync(join(dirname(file), f)).mtimeMs > STALE) unlinkSync(join(dirname(file), f)); } catch {}
  }
  appendFileSync(file, JSON.stringify(a) + "\n");
  try {
    if (statSync(file).size > BIG) writeFileSync(file, readFileSync(file, "utf8").trim().split("\n").slice(-KEEP).join("\n") + "\n");
  } catch {}
}

// The latest `n` lines of a session's activity, oldest first.
export function readActivity(kz: string, session: unknown, n = 20): Act[] {
  if (typeof session !== "string" || !session) return [];
  try {
    return readFileSync(activityFile(kz, session), "utf8").trim().split("\n").slice(-n).flatMap((l) => { try { return [JSON.parse(l) as Act]; } catch { return []; } });
  } catch { return []; }
}
export const activityMtime = (kz: string, session: unknown): number => {
  try { return typeof session === "string" && session ? statSync(activityFile(kz, session)).mtimeMs : 0; } catch { return 0; }
};

if (import.meta.main) {
  try { record(JSON.parse(await Bun.stdin.text())); } catch {}
  process.exit(0);
}
