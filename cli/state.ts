// Everything kaizen knows about a project's state, read from and written to the
// `.kaizen/` directory. No terminal, no HTTP: the TUI (`dashboard.ts`) and the web
// board (`web.ts`) both import this and draw it their own way.
import { existsSync, readFileSync, readdirSync, appendFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";

export const home = homedir();

export type Run = { id: string; stage: string; awaiting: string | null; moved: number; runner?: string; agent?: string };

export const KNOWN_AGENTS = [
  { name: "Claude Code", dir: ".claude", cmd: "claude" },
  { name: "Antigravity", dir: ".agents", cmd: "agy" },
  { name: "Codex", dir: ".codex", cmd: "codex" },
  { name: "OpenCode", dir: ".opencode", cmd: "opencode" },
  { name: "Gemini CLI", dir: ".gemini", cmd: "gemini" },
  { name: "Cursor", dir: ".cursor", cmd: "cursor" },
];

export function detectDefaultAgent(projectDir: string): { name: string; cmd: string } {
  const cfgFile = existsSync(join(projectDir, ".kaizen", "config.yml"))
    ? join(projectDir, ".kaizen", "config.yml")
    : join(home, ".kaizen", "config.yml");
  if (existsSync(cfgFile)) {
    const text = readFileSync(cfgFile, "utf8");
    const m = /^\s*agent:\s*\n\s*default:\s*(\S+)/m.exec(text) || /^\s*agent\.default:\s*(\S+)/m.exec(text);
    if (m && m[1] && m[1] !== "auto") {
      const found = KNOWN_AGENTS.find((a) => a.cmd === m[1] || a.name.toLowerCase() === m[1].toLowerCase());
      if (found && Bun.which(found.cmd)) return found;
    }
  }

  for (const a of KNOWN_AGENTS) {
    if (existsSync(join(projectDir, a.dir)) && Bun.which(a.cmd)) return a;
  }
  if (Bun.which("claude")) return { name: "Claude Code", cmd: "claude" };
  for (const a of KNOWN_AGENTS) {
    if (Bun.which(a.cmd)) return a;
  }
  return { name: "Claude Code", cmd: "claude" };
}

// Flags that pin the launched session's model and effort, from the config chain:
//   agent:
//     codex: { model: gpt-5, effort: low }
// Each tool spells the flag its own way; a tool not listed here takes none.
const MODEL_FLAGS: Record<string, (m: string) => string[]> = {
  claude: (m) => ["--model", m], agy: (m) => ["--model", m], codex: (m) => ["-m", m],
  gemini: (m) => ["-m", m], opencode: (m) => ["-m", m],
};
const EFFORT_FLAGS: Record<string, (e: string) => string[]> = {
  claude: (e) => ["--effort", e], agy: (e) => ["--effort", e],
  codex: (e) => ["-c", `model_reasoning_effort=${e}`],
};

export function agentFlags(projectDir: string, cmd: string, configText?: string): string[] {
  if (configText === undefined) {
    const f = [join(projectDir, ".kaizen", "config.yml"), join(home, ".kaizen", "config.yml")].find(existsSync);
    configText = f ? readFileSync(f, "utf8") : "";
  }
  // ponytail: regex over the yaml, like detectDefaultAgent; a parser when a third key needs it
  const block = new RegExp(`^agent:\\n(?:[ \\t]+.*\\n)*?[ \\t]+${cmd}:[ \\t]*(\\{[^}]*\\}|\\n(?:[ \\t]+[a-z]+:.*\\n?)+)`, "m").exec(configText);
  if (!block) return [];
  const get = (k: string) => new RegExp(`\\b${k}:[ \\t]*["']?([^"',}\\s]+)`).exec(block[1])?.[1];
  const model = get("model"), effort = get("effort");
  return [
    ...(model && MODEL_FLAGS[cmd] ? MODEL_FLAGS[cmd](model) : []),
    ...(effort && EFFORT_FLAGS[cmd] ? EFFORT_FLAGS[cmd](effort) : []),
  ];
}

export function findTerminal(cwd: string, fullCmd: string[]): { cmd: string[]; detached: boolean } | null {
  const hasDisplay = Boolean(process.env.WAYLAND_DISPLAY || process.env.DISPLAY);
  const inTmux = Boolean(process.env.TMUX);

  // Windows has no xdg anything, and none of the terminals below exist there.
  // PowerShell is what a Windows user has open anyway: one -Command string,
  // where a single quote is doubled rather than escaped. Windows Terminal hosts
  // it when installed; otherwise `start` gives it a window of its own.
  if (process.platform === "win32") {
    const q = (a: string) => `'${a.replace(/'/g, "''")}'`;
    const shell = Bun.which("pwsh.exe") ? "pwsh.exe" : "powershell.exe";
    // No Set-Location in the command: both launchers set the directory themselves,
    // and the semicolon that would separate the two statements is what Windows
    // Terminal splits its own arguments on. Any semicolon still left in the prompt
    // is escaped for wt, which reads it before PowerShell ever sees the quoting.
    const ps = `& ${fullCmd.map(q).join(" ")}`;
    if (Bun.which("wt.exe")) {
      return {
        cmd: ["wt.exe", "-d", cwd, shell, "-NoExit", "-Command", ps.replace(/;/g, "\\;")],
        detached: true,
      };
    }
    // `start` reads a title only when quoted; an unquoted word is the command, so
    // "kaizen" here ran kaizen's own launcher. The empty title is what Bun quotes.
    return {
      cmd: ["cmd.exe", "/c", "start", "", "/D", cwd, shell, "-NoExit", "-Command", ps],
      detached: true,
    };
  }

  if (process.env.TERMINAL && Bun.which(process.env.TERMINAL)) {
    const term = process.env.TERMINAL;
    if (term.includes("kitty")) return { cmd: [term, "--directory", cwd, ...fullCmd], detached: true };
    if (term.includes("alacritty")) return { cmd: [term, "--working-directory", cwd, "-e", ...fullCmd], detached: true };
    if (term.includes("ghostty")) return { cmd: [term, `--working-directory=${cwd}`, "-e", ...fullCmd], detached: true };
    if (term.includes("foot")) return { cmd: [term, "-D", cwd, ...fullCmd], detached: true };
    return { cmd: [term, "-e", ...fullCmd], detached: true };
  }

  if (hasDisplay && Bun.which("xdg-terminal-exec")) {
    return { cmd: ["xdg-terminal-exec", `--dir=${cwd}`, "--", ...fullCmd], detached: true };
  }

  if (hasDisplay) {
    if (Bun.which("kitty")) return { cmd: ["kitty", "--directory", cwd, ...fullCmd], detached: true };
    if (Bun.which("ghostty")) return { cmd: ["ghostty", `--working-directory=${cwd}`, "-e", ...fullCmd], detached: true };
    if (Bun.which("alacritty")) return { cmd: ["alacritty", "--working-directory", cwd, "-e", ...fullCmd], detached: true };
    if (Bun.which("foot")) return { cmd: ["foot", "-D", cwd, ...fullCmd], detached: true };
    if (Bun.which("wezterm")) return { cmd: ["wezterm", "start", "--cwd", cwd, "--", ...fullCmd], detached: true };
    if (Bun.which("gnome-terminal")) return { cmd: ["gnome-terminal", `--working-directory=${cwd}`, "--", ...fullCmd], detached: true };
    if (Bun.which("xfce4-terminal")) return { cmd: ["xfce4-terminal", `--default-working-directory=${cwd}`, "-x", ...fullCmd], detached: true };
    if (Bun.which("konsole")) return { cmd: ["konsole", "--workdir", cwd, "-e", ...fullCmd], detached: true };
    if (Bun.which("xterm")) return { cmd: ["xterm", "-e", `cd "${cwd}" && ${fullCmd.join(" ")}`], detached: true };
  }

  if (inTmux && Bun.which("tmux")) {
    const cmdStr = fullCmd.map((a) => (a.includes(" ") ? JSON.stringify(a) : a)).join(" ");
    return { cmd: ["tmux", "new-window", "-c", cwd, cmdStr], detached: false };
  }

  if (process.platform === "darwin") {
    const cmdStr = fullCmd.map((a) => (a.includes(" ") ? `\\"${a}\\"` : a)).join(" ");
    const script = `tell application "Terminal" to do script "cd \\"${cwd}\\" && ${cmdStr}"\ntell application "Terminal" to activate`;
    return { cmd: ["osascript", "-e", script], detached: true };
  }

  return null;
}

// The list of projects kaizen knows about. Appended to as kaizen sets one up or is
// opened inside one, and seeded by the Find projects action. Plain lines so it can be
// read and corrected in an editor; blanks and # lines ignored.
export const REGISTRY = join(home, ".kaizen", "projects");

// Windows spreads work across drives -- the profile on C:, the projects on D: or E: --
// and a search that only knows $HOME finds none of them. Every letter that answers is
// a root worth walking; elsewhere there is one filesystem and $HOME is where work
// lives, so walking / would cost minutes to find nothing.
export function searchRoots(extra: string[] = []): string[] {
  const roots = [home, ...extra];
  if (process.platform === "win32") {
    for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
      const drive = `${letter}:\\`;
      try { readdirSync(drive); roots.push(drive); } catch { /* no such drive */ }
    }
  }
  return roots.filter((d, i, all) => d && all.indexOf(d) === i);
}

export function knownProjects(): string[] {
  if (!existsSync(REGISTRY)) return [];
  return readFileSync(REGISTRY, "utf8").split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

// Never fails the command that triggered it: a read-only home is not a reason for a
// dashboard to stop opening.
export function remember(projectDir: string) {
  try {
    if (knownProjects().includes(projectDir)) return;
    mkdirSync(dirname(REGISTRY), { recursive: true });
    appendFileSync(REGISTRY, projectDir + "\n");
  } catch { /* nothing here is worth an error */ }
}

export const SKIP = new Set([
  "windows", "program files", "program files (x86)", "programdata", "$recycle.bin",
  "system volume information", "appdata", "node_modules", "recovery", "perflogs",
  "library", "applications", "onedrive", "onedrivetemp",
]);

// Bounded on purpose. Depth is what keeps this from becoming a filesystem walk, and
// the skips are the directories that make one slow: node_modules, and anything dotted
// (which includes .git, and every state directory that is not a project of its own).
export function findProjects(root: string, depth = 4): string[] {
  const found: string[] = [];
  const walk = (dir: string, left: number) => {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    // $HOME holds ~/.kaizen, the global state, which is not a project and must not
    // stop the walk before it has looked at anything.
    // A project can hold projects of its own -- a monorepo, or a folder of them --
    // so finding one is not a reason to stop looking underneath it.
    if (dir !== root && entries.includes(".kaizen")) found.push(dir);
    if (left === 0) return;
    for (const name of entries) {
      if (name.startsWith(".") || name === "node_modules") continue;
      // Walking a whole drive means walking Windows itself otherwise: tens of
      // thousands of directories that have never held a project.
      if (SKIP.has(name.toLowerCase())) continue;
      try { if (statSync(join(dir, name)).isDirectory()) walk(join(dir, name), left - 1); }
      catch { /* unreadable or vanished mid-walk */ }
    }
  };
  walk(root, depth);
  return found;
}

export function locate() {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, ".kaizen"))) return join(dir, ".kaizen");
    if (existsSync(join(dir, ".git"))) return null;
    const up = dirname(dir);
    if (up === dir) return existsSync(join(home, ".kaizen")) ? join(home, ".kaizen") : null;
    dir = up;
  }
}

export function readRuns(state: string): Run[] {
  const dir = join(state, "runs");
  if (!existsSync(dir)) return [];
  // readdir order is the filesystem's, not the alphabet's; ids start with the date,
  // so sorting is what makes "newest first" true everywhere.
  return readdirSync(dir).sort().flatMap((id) => {
    try {
      const file = join(dir, id, "state.json");
      const s = JSON.parse(readFileSync(file, "utf8"));
      // When the run last moved. Kaizen records no liveness signal, so the file's
      // own mtime is the only evidence that anything is still working on it.
      let moved = 0;
      try { moved = statSync(file).mtimeMs; } catch { /* vanished mid-read */ }
      return [{ id, stage: s.stage ?? "?", awaiting: s.awaiting ?? null, moved, runner: s.runner, agent: s.agent }];
    } catch { return []; }
  }).reverse();
}

// Open items are the ones worth a number; done and rejected stay as record.
export function backlog(state: string) {
  const files = [join(state, "backlog.md")];
  const runs = join(state, "runs");
  if (existsSync(runs)) for (const id of readdirSync(runs)) files.push(join(runs, id, "06-backlog.md"));
  let n = 0;
  for (const f of files) {
    if (!existsSync(f)) continue;
    n += (readFileSync(f, "utf8").match(/^\s*-\s*open:/gm) ?? []).length;
  }
  return n;
}

export function version(repo: string) {
  try { return JSON.parse(readFileSync(join(repo, "package.json"), "utf8")).version; } catch { return ""; }
}
// The global state directory is not a project and has no parent worth naming.
export function label(stateDir: string) {
  return stateDir === join(home, ".kaizen") ? "no project" : tilde(dirname(stateDir));
}

export function tilde(p: string) { return p.startsWith(home) ? "~" + p.slice(home.length) : p; }

// The first few real lines of a file's body, blank lines and headings dropped.
export function section(file: string, n: number) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .slice(0, n);
}

export function readFindings(file: string) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\d+\.\s/.test(l) || /\b(critical|high|medium|low)\b:/.test(l));
}

// Backlog items are often a reviewer's finding pasted verbatim -- a backticked
// path, a severity, then the sentence. Split those apart so a list can show the
// severity and the place as columns and leave the prose to speak for itself.
export type Item = { severity: string | null; where: string | null; text: string; raw: string; notes?: string };

export function parseItem(raw: string): Item {
  const m = /^`?([^`:]+(?::\d+)?)`?\s*[:—-]\s*(critical|high|medium|low)\s*[:—-]\s*(.+)$/i.exec(raw);
  if (m) {
    const where = m[1]!.trim().split("/").pop()!;
    return { severity: m[2]!.toLowerCase(), where, text: tidy(m[3]!), raw };
  }
  const sev = /^(critical|high|medium|low)\s*[:—-]\s*(.+)$/i.exec(raw);
  if (sev) return { severity: sev[1]!.toLowerCase(), where: null, text: tidy(sev[2]!), raw };
  return { severity: null, where: null, text: tidy(raw), raw };
}

// One readable sentence: no markdown, and the fix belongs in the full view. The
// first word is left alone -- capitalising it turns request_for_id into
// Request_for_id, which is a different identifier.
export function tidy(text: string) {
  return text.replace(/`/g, "").split(/\s+Fix:\s+/)[0]!.trim();
}

export function readBacklog(file: string) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n")
    .map((l) => l.trim())
    .filter((l) => /^-\s*open:/.test(l))
    .map((l) => l.replace(/^-\s*open:\s*/, ""));
}

export function allBacklog(state: string) {
  const out: { run: string; items: string[] }[] = [];
  const runs = join(state, "runs");
  if (existsSync(runs)) {
    for (const id of readdirSync(runs).sort().reverse()) {
      const items = readBacklog(join(runs, id, "06-backlog.md"));
      if (items.length) out.push({ run: id, items });
    }
  }
  const orphan = readBacklog(join(state, "backlog.md"));
  if (orphan.length) out.push({ run: "Orphaned", items: orphan });
  return out;
}

// ---------------------------------------------------------------- board data

// ---------------------------------------------------------------- board data

export type Card = {
  kind: "idea" | "run";
  id?: string;                                     // runs only: the directory name
  status: string;                                  // what the legend calls this card
  text: string;
  state: string;
  where: string;
  column: number;
  awaiting: string | null;
  dim: boolean;
  moved?: number;                                  // runs only: state.json mtime
  title?: string;                                  // runs only: first line of the request
  archived: boolean;                               // hidden from the board unless asked for
  tags?: string[];                                 // runs only: runner and agent, when recorded
  notes?: string;                                  // inbox notes, or runs/<id>/notes.md
};

// A run is called running on the evidence that it moved recently; there is no PID
// to ask. Anything in flight and older than this is stalled, not running -- the
// difference the board exists to show.

// The verbatim request of every run, normalised, so an idea that has become a run
// can be retired from the board.
// ponytail: reads each run's 00-request.md on every refresh; fine at tens of runs,
// cache by mtime if a project ever has hundreds.
export function startedRuns(state: string): string[] {
  const dir = join(state, "runs");
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const id of readdirSync(dir)) {
    try { out.push(normalise(readFileSync(join(dir, id, "00-request.md"), "utf8"))); }
    catch { /* no request file, or unreadable */ }
  }
  return out;
}

export function normalise(text: string) {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export const RUNNING_WITHIN_MS = 30 * 60_000;

// The status is what the legend lists; how it is drawn is each UI's business, so
// nothing here knows about colour.
export type Status = "abandoned" | "waiting" | "done" | "running" | "stalled";

export function statusOf(r: Run, now: number): Status {
  if (r.stage === "abandoned") return "abandoned";
  if (r.awaiting) return "waiting";
  if (r.stage === "done") return "done";
  return now - r.moved < RUNNING_WITHIN_MS ? "running" : "stalled";
}

// A stage this build has never heard of still belongs somewhere visible. What the
// run is waiting on says where it really is (a run awaiting the review approval is
// in Review whatever its stage word), and PLANNING is the honest guess otherwise:
// the run has started and has not finished.
export function columnOf(stage: string, awaiting: string | null = null) {
  if (stage === "build") return 2;
  if (stage === "review") return 3;
  if (stage === "done" || stage === "abandoned") return 4;
  if (awaiting === "approvals.review" || awaiting === "findings") return 3;
  if (awaiting === "approvals.each_file") return 2;
  return 1;
}

// notes: free text under the bullet -- links, path:line refs, background. Kept as
// indented continuation lines so a one-line inbox from before notes reads unchanged.
export type InboxLine = { status: string; text: string; notes?: string };

// Ideas with no run yet. Deliberately not backlog.md, which the spec defines as
// an orphanage for items rescued from pruned runs, and not a run stub each.
export function readInbox(state: string): InboxLine[] {
  const f = join(state, "inbox.md");
  if (!existsSync(f)) return [];
  const out: InboxLine[] = [];
  for (const raw of readFileSync(f, "utf8").split("\n")) {
    const m = /^-\s*(open|started|done|rejected|archived):\s*(.+)$/.exec(raw.trim());
    if (m) { out.push({ status: m[1]!, text: m[2]!.trim() }); continue; }
    // An indented line belongs to the bullet above it; anything else is noise.
    const last = out[out.length - 1];
    if (last && /^\s{2,}\S/.test(raw)) last.notes = (last.notes ? last.notes + "\n" : "") + raw.trim();
  }
  return out;
}

// Whole-file rewrite. The board is the only writer today.
// ponytail: single writer assumed; if a kaizen stage ever appends here too, this
// needs a lock or an append-only journal.
export function writeInbox(state: string, lines: InboxLine[]) {
  mkdirSync(state, { recursive: true });
  const body = [
    "# Inbox",
    "",
    "Ideas with no run yet. One line each, same format as a run's backlog.",
    "",
    ...lines.flatMap((l) => [`- ${l.status}: ${l.text}`, ...noteLines(l.notes)]),
  ];
  writeFileSync(join(state, "inbox.md"), body.join("\n") + "\n");
}

function noteLines(notes?: string) {
  return (notes ?? "").split("\n").map((n) => n.trim()).filter(Boolean).map((n) => "  " + n);
}

// The request the agent is launched with: the text, then the notes as the rest of the
// request, so they land verbatim in 00-request.md and the planner reads them.
export function requestOf(text: string, notes?: string, state?: string) {
  let n = (notes ?? "").trim();
  if (state) n = n.replace(/\]\((attachments\/[^)]+)\)/g, (_, p) => `](${join(state, p)})`);
  return n ? `${text}\n\n${n}` : text;
}

// Free text beside a run -- what the user learned after the idea became a run.
// Its own file, never state.json: that shape is the resume contract.
export function readNotes(state: string, id: string) {
  try { return readFileSync(join(state, "runs", id, "notes.md"), "utf8"); } catch { return ""; }
}

export function writeNotes(state: string, id: string, text: string): string | null {
  const dir = join(state, "runs", id);
  if (!existsSync(join(dir, "state.json"))) return "no such run";
  writeFileSync(join(dir, "notes.md"), text.trim() ? text.trim() + "\n" : "");
  return null;
}

// Notes are a log, one entry per message: `[2026-09-14 15:34] text`, continuation
// lines indented. Text before the first stamp is one unstamped entry, so notes
// written by hand still read.
export type Note = { at: string; text: string };

export function parseNotes(src: string): Note[] {
  const out: Note[] = [];
  for (const raw of src.split("\n")) {
    const m = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\]\s?(.*)$/.exec(raw);
    if (m) { out.push({ at: m[1]!, text: m[2]! }); continue; }
    const last = out[out.length - 1];
    if (last) last.text += "\n" + raw.replace(/^\s{2}/, "");
    else if (raw.trim()) out.push({ at: "", text: raw });
  }
  return out.map((n) => ({ ...n, text: n.text.trim() })).filter((n) => n.text);
}

export function stamp(now = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`;
}

export function formatNote(text: string, at = stamp()) {
  return `[${at}] ${text.trim().replace(/\n/g, "\n  ")}`;
}

// Append one entry: to runs/<id>/notes.md for a run, or under the idea's inbox
// bullet. Attachments arrive as markdown links already written into text.
export function appendNote(state: string, target: { id: string } | { text: string }, text: string): string | null {
  if (!text.trim()) return "empty note";
  if ("id" in target) {
    if (!existsSync(join(state, "runs", target.id, "state.json"))) return "no such run";
    appendFileSync(join(state, "runs", target.id, "notes.md"), formatNote(text) + "\n");
    return null;
  }
  const lines = readInbox(state);
  const at = lines.findIndex((l) => l.status === "open" && l.text === target.text);
  if (at < 0) return "no such idea";
  const prev = lines[at]!.notes;
  lines[at] = { ...lines[at]!, notes: (prev ? prev + "\n" : "") + formatNote(text) };
  writeInbox(state, lines);
  return null;
}

// A file beside the notes it belongs to: runs/<id>/attachments/ for a run,
// <state>/attachments/ for an idea. Returns the path relative to the state dir,
// which is what the note links and what /file serves.
// ponytail: no dedupe, no size accounting beyond the request cap in web.ts.
export function saveAttachment(state: string, id: string | null, name: string, bytes: Uint8Array) {
  const safe = name.replace(/[^\w.-]+/g, "_").replace(/^\.+/, "") || "file";
  const rel = id ? join("runs", id, "attachments") : "attachments";
  mkdirSync(join(state, rel), { recursive: true });
  const file = `${Date.now().toString(36)}-${safe}`;
  writeFileSync(join(state, rel, file), bytes);
  return join(rel, file);
}

// Best effort: a machine without notify-send loses the notification, not the board.
export function notify(title: string, body: string) {
  try {
    if (!Bun.which("notify-send")) return;
    Bun.spawn(["notify-send", title, body], {
      stdin: "ignore", stdout: "ignore", stderr: "ignore", detached: true,
    }).unref();
  } catch { /* notifications are not worth an exception */ }
}

// Run ids carry the date they started; the list is already in date order.
export function short(id: string) { return id.replace(/^\d{4}-\d{2}-\d{2}-/, ""); }

// The only run state the board writes, and only this transition: stage becomes
// abandoned, awaiting clears. Every other field is preserved, so a run abandoned
// here still resumes and reads like one abandoned by /kaizen abort.
export function abandonRun(st: string, id: string, why: string): string | null {
  const file = join(st, "runs", id, "state.json");
  try {
    const run = JSON.parse(readFileSync(file, "utf8"));
    if (run.stage === "abandoned") return "That run is already abandoned.";
    run.stage = "abandoned";
    run.awaiting = null;
    run.updated = new Date().toISOString();
    writeFileSync(file, JSON.stringify(run, null, 2) + "\n");
    // The reason belongs in the record, not in state.json, whose shape is the
    // resume contract every kaizen tool reads.
    appendFileSync(join(st, "runs", id, "02-approval.md"),
      `\n---\n\n## Abandoned\n\n${new Date().toISOString()} — abandoned from the board.\n\n${why}\n`);
    return null;
  } catch (err: any) {
    return err?.message ?? String(err);
  }
}

export function replaceIdea(state: string, text: string, next: InboxLine | null) {
  const lines = readInbox(state);
  const at = lines.findIndex((l) => (l.status === "open" || l.status === "started") && l.text === text);
  if (at < 0) return;                            // changed underneath us; the redraw will show why
  if (next) lines[at] = { notes: lines[at]!.notes, ...next }; else lines.splice(at, 1);
  writeInbox(state, lines);
}

// Archived runs stay exactly where they are on disk -- run directories are never
// moved or renamed, that is the resume contract -- and are listed here instead.
// One id per line; the board hides them unless asked for the archive.
export function readArchive(state: string): Set<string> {
  const f = join(state, "archive.md");
  if (!existsSync(f)) return new Set();
  return new Set(readFileSync(f, "utf8").split("\n")
    .map((l) => /^-\s*(\S+)/.exec(l.trim())?.[1])
    .filter((x): x is string => !!x));
}

export function writeArchive(state: string, ids: Set<string>) {
  mkdirSync(state, { recursive: true });
  const body = ["# Archive", "", "Runs cleared from the board. One id per line; delete a line to bring it back.", "",
    ...[...ids].sort().map((id) => `- ${id}`)];
  writeFileSync(join(state, "archive.md"), body.join("\n") + "\n");
}

export function setArchived(state: string, id: string, archived: boolean) {
  const ids = readArchive(state);
  if (archived) ids.add(id); else ids.delete(id);
  writeArchive(state, ids);
}

// The request's first real line: not a heading, not a label ending in a colon,
// quote marker dropped. Long enough to recognise the run, short enough for a card.
export function requestTitle(text: string) {
  const line = text.split("\n")
    .map((l) => l.replace(/^>\s*/, "").trim())
    .filter((l) => l && !l.startsWith("#"))
    .slice(0, 6)
    .find((l) => l && !l.endsWith(":") && !/^---/.test(l)) ?? "";
  return line.length > 140 ? line.slice(0, 139) + "…" : line;
}

// Every card on the board, for the state dirs asked for. Retirement of an idea is
// checked against every known project's runs, not just these: an idea in the global
// inbox becomes a run in whichever project the agent was started in.
export function boardCards(states: string[], now: number): Card[] {
  const next: Card[] = [];
  // One read per request file; both the retirement check and the card title come
  // from the same text.
  // ponytail: still every run's 00-request.md on every refresh; cache by mtime if a
  // project ever has hundreds.
  const bodies = new Map<string, string>();
  const body = (st: string, id: string) => {
    const f = join(st, "runs", id, "00-request.md");
    if (!bodies.has(f)) { try { bodies.set(f, readFileSync(f, "utf8")); } catch { bodies.set(f, ""); } }
    return bodies.get(f)!;
  };
  const requests: string[] = [];
  for (const st of [...states, ...knownProjects().map((d) => join(d, ".kaizen")), join(home, ".kaizen")]
    .filter((d, i, all) => all.indexOf(d) === i && existsSync(join(d, "runs")))) {
    for (const id of readdirSync(join(st, "runs"))) { const b = body(st, id); if (b) requests.push(normalise(b)); }
  }
  for (const st of states) {
    const where = label(st);
    const archive = readArchive(st);
    for (const it of readInbox(st)) {
      if (it.status !== "open" && it.status !== "started" && it.status !== "archived") continue;
      // Retired once any run's request contains this text -- whoever started it.
      // Checking `started` items only would leave every idea acted on outside the
      // board sitting in IDEA forever, and typing `/kaizen ...` in a terminal is
      // the common way a run begins.
      if (requests.some((r) => r.includes(normalise(it.text)))) continue;
      next.push(it.status === "started"
        ? { kind: "idea", status: "starting", text: it.text, state: st, where, column: 1, awaiting: null, dim: true, archived: false, notes: it.notes }
        : { kind: "idea", status: "idea", text: it.text, state: st, where, column: 0, awaiting: null, dim: false, archived: it.status === "archived", notes: it.notes });
    }
    for (const r of readRuns(st)) {
      next.push({
        kind: "run", id: r.id, status: statusOf(r, now), text: short(r.id), state: st, where, column: columnOf(r.stage, r.awaiting), moved: r.moved,
        title: requestTitle(body(st, r.id)),
        awaiting: r.stage === "abandoned" ? null : r.awaiting,
        dim: r.stage === "abandoned",
        archived: archive.has(r.id),
        tags: [r.runner, r.agent].filter((t): t is string => !!t),
        notes: readNotes(st, r.id) || undefined,
      });
    }
  }
  return next;
}

// What starting a run needs, minus the screens: the TUI and the web board both
// launch the same way and only differ in how they tell the user.
export type Launch =
  | { ok: true; agent: { name: string; cmd: string }; prompt: string; projectDir: string; cmd: string[] }
  | { ok: false; agent: { name: string; cmd: string }; prompt: string; projectDir: string; manual: string; why: string };

export function projectOf(from: string) {
  return from === join(home, ".kaizen")
    ? process.cwd()
    : (from.endsWith(".kaizen") ? dirname(from) : from);
}

export function manualCommand(projectDir: string, agentCmd: string, prompt: string, flags: string[] = []) {
  const bin = [agentCmd, ...flags].join(" ");
  return process.platform === "win32"
    ? `cd '${projectDir}'; & ${bin} '${prompt.replace(/'/g, "''")}'`
    : `cd "${projectDir}" && ${bin} "${prompt}"`;
}

export function launchRun(it: Item, from: string): Launch {
  const projectDir = projectOf(from);
  // The run will be born here; the board must know the dir or the idea never retires.
  remember(projectDir);
  const agent = detectDefaultAgent(projectDir);
  const agentBin = Bun.which(agent.cmd) ?? agent.cmd;
  const prompt = requestOf(it.where ? `/kaizen ${it.text} (${it.where})` : `/kaizen ${it.text}`, it.notes, from);
  const flags = agentFlags(projectDir, agent.cmd);
  const fullCmd = [agentBin, ...flags, prompt];
  const manual = manualCommand(projectDir, agent.cmd, prompt, flags);

  const term = findTerminal(projectDir, fullCmd);
  if (!term) {
    return {
      ok: false, agent, prompt, projectDir, manual,
      why: process.platform === "darwin"
        ? "Terminal.app could not be driven from here."
        : "No supported terminal emulator found (xdg-terminal-exec, kitty, ghostty, alacritty, tmux).",
    };
  }
  try {
    const proc = Bun.spawn(term.cmd, {
      cwd: projectDir,
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      detached: term.detached,
    });
    if (term.detached) proc.unref();
    return { ok: true, agent, prompt, projectDir, cmd: term.cmd };
  } catch (err: any) {
    return { ok: false, agent, prompt, projectDir, manual, why: err?.message ?? String(err) };
  }
}
