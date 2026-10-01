// Everything kaizen knows about a project's state, read from and written to the
// `.kaizen/` directory. No terminal, no HTTP: the TUI (`dashboard.ts`) and the web
// board (`web.ts`) both import this and draw it their own way.
import { existsSync, readFileSync, readdirSync, appendFileSync, writeFileSync, mkdirSync, statSync, realpathSync, rmSync } from "node:fs";
import { join, dirname, win32 } from "node:path";
import { homedir, arch, cpus, release, totalmem, version as osVersion } from "node:os";

// The real path: process.cwd() is always physical, so a raw $HOME that crosses a
// symlink (/home -> var/home) would never compare equal to it.
export const home = (() => { try { return realpathSync(homedir()); } catch { return homedir(); } })();

export type Run = { id: string; stage: string; awaiting: string | null; moved: number; runner?: string; agent?: string };

export const KNOWN_AGENTS = [
  { name: "Claude Code", dir: ".claude", cmd: "claude" },
  { name: "Antigravity", dir: ".agents", cmd: "agy" },
  { name: "Codex", dir: ".codex", cmd: "codex" },
  { name: "OpenCode", dir: ".opencode", cmd: "opencode" },
  { name: "Gemini CLI", dir: ".gemini", cmd: "gemini" },
  { name: "Cursor", dir: ".cursor", cmd: "cursor" },
];

export type Agent = { name: string; cmd: string; note?: string };

// Each config.yml in the chain, project first: the first one that sets a key decides
// it, so a project file that is silent about `agent` leaves the global one in force.
const configTexts = (projectDir: string) =>
  [join(projectDir, ".kaizen", "config.yml"), join(home, ".kaizen", "config.yml")].filter(existsSync).map(readText);

// `want` is a per-run pick; without one, agent.default from the config chain. A
// wanted tool that is not installed is swapped for the auto choice, and said so.
export function detectDefaultAgent(projectDir: string, want?: string): Agent {
  if (!want) for (const t of configTexts(projectDir)) {
    const m = /^agent:\n(?:[ \t]+.*\n)*?[ \t]+default:[ \t]*["']?([^"'\s]+)/m.exec(t) || /^agent\.default:[ \t]*["']?([^"'\s]+)/m.exec(t);
    if (m) { want = m[1]; break; }
  }
  if (!want || want === "auto") return autoAgent(projectDir);
  const found = KNOWN_AGENTS.find((a) => a.cmd === want || a.name.toLowerCase() === want!.toLowerCase());
  if (found && onPath(found.cmd)) return found;
  const a = autoAgent(projectDir);
  return { ...a, note: `${found?.name ?? want} is not installed; opened ${a.name} instead` };
}

function autoAgent(projectDir: string): Agent {
  for (const a of KNOWN_AGENTS) {
    if (existsSync(join(projectDir, a.dir)) && onPath(a.cmd)) return a;
  }
  if (onPath("claude")) return { name: "Claude Code", cmd: "claude" };
  for (const a of KNOWN_AGENTS) {
    if (onPath(a.cmd)) return a;
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

// Each tool's own skip-every-permission-prompt mode, taken only when the Run form's
// Yolo is picked for that launch. Flags as each tool's --help spells them.
export const YOLO_FLAGS: Record<string, string[]> = {
  claude: ["--dangerously-skip-permissions"], agy: ["--dangerously-skip-permissions"],
  codex: ["--dangerously-bypass-approvals-and-sandbox"], gemini: ["--yolo"], opencode: ["--auto"],
};

// How each tool takes the opening prompt and stays interactive. agy refuses a bare
// argument and exits; opencode reads one as the project folder to open.
const PROMPT_FLAGS: Record<string, string[]> = { agy: ["-i"], opencode: ["--prompt"] };
export const promptArgs = (cmd: string, prompt: string) => [...(PROMPT_FLAGS[cmd] ?? []), prompt];

// A model typed on the board reaches launch lines and the manual command as text, so
// only a plain name is taken: no spaces, quotes, `$`, `;`, backticks or globs.
export const plainModel = (m: string) => /^[A-Za-z0-9][\w.:\/@-]{0,79}$/.test(m);

// The tool's own block in the first config.yml of the chain that has one.
function agentConfig(projectDir: string, cmd: string, configText?: string) {
  // ponytail: regex over the yaml, like detectDefaultAgent; a parser when a third key needs it
  const re = new RegExp(`^agent:\\n(?:[ \\t]+.*\\n)*?[ \\t]+${cmd}:[ \\t]*(\\{[^}]*\\}|\\n(?:[ \\t]+[a-z]+:.*\\n?)+)`, "m");
  let block: RegExpExecArray | null = null;
  for (const t of configText === undefined ? configTexts(projectDir) : [configText]) if ((block = re.exec(t))) break;
  const get = (k: string) => block && new RegExp(`\\b${k}:[ \\t]*["']?([^"',}\\s]+)`).exec(block[1])?.[1];
  return { model: get("model") || undefined, effort: get("effort") || undefined };
}

// `model`: a per-run pick, in place of the configured one. Effort stays configured.
export function agentFlags(projectDir: string, cmd: string, configText?: string, model?: string): string[] {
  const cfg = agentConfig(projectDir, cmd, configText);
  const m = model || cfg.model;
  return [
    ...(m && MODEL_FLAGS[cmd] ? MODEL_FLAGS[cmd](m) : []),
    ...(cfg.effort && EFFORT_FLAGS[cmd] ? EFFORT_FLAGS[cmd](cfg.effort) : []),
  ];
}

// What the board's Run form offers: the installed tools, the one it would pick, and
// each one's configured model to start the field from.
export function agentChoices(projectDir: string) {
  return {
    default: detectDefaultAgent(projectDir).cmd,
    agents: KNOWN_AGENTS.filter((a) => onPath(a.cmd)).map((a) => ({
      name: a.name, cmd: a.cmd, model: agentConfig(projectDir, a.cmd).model ?? "", models: !!MODEL_FLAGS[a.cmd], yolo: !!YOLO_FLAGS[a.cmd],
    })),
  };
}

// One argument as a POSIX shell reads it literally: a prompt carries quotes, `$`,
// backticks and, with notes, newlines.
const shq = (a: string) => `'${a.replace(/'/g, `'\\''`)}'`;

// Bun.which reads the PATH the process started with unless handed the current one.
// Windows PowerShell 5.1 writes `Set-Content -Encoding utf8` with a byte order mark,
// and agents on Windows write run files that way. JSON.parse refuses a leading BOM
// (the run vanished from the board) and it hides a first line from every ^ regex.
// PowerShell and Git for Windows clones (autocrlf) also write CRLF, which breaks
// every `key:\n` regex the same silent way, so line endings are made LF here too.
export const readText = (file: string) => readFileSync(file, "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");

const onPath = (bin: string) => Bun.which(bin, { PATH: process.env.PATH });

// Windows' own programs by full path: a board started from the shortcut or a
// stripped-down environment can have a PATH without System32, and a bare "cmd.exe"
// then fails with "Executable not found in $PATH".
const sysRoot = () => process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows";
export const sysExe = (name: string) => `${sysRoot()}\\System32\\${name}`;
export const cmdExe = () => process.env.ComSpec ?? sysExe("cmd.exe");
export const powershellExe = () => onPath("pwsh.exe") ?? onPath("powershell.exe") ?? sysExe("WindowsPowerShell\\v1.0\\powershell.exe");

// Whether a multiplexer's server is up: its own CLI says so by exit code. spawnSync
// throws on a missing binary, so the path is resolved first.
function answers(cmd: string[]): boolean {
  const bin = onPath(cmd[0]);
  if (!bin) return false;
  try {
    return Bun.spawnSync([bin, ...cmd.slice(1)], { stdin: "ignore", stdout: "ignore", stderr: "ignore", timeout: 2000, windowsHide: true }).exitCode === 0;
  } catch {
    return false;
  }
}

// pidFile: where the launched agent writes its own PID, so closeSessions can end it.
export function findTerminal(cwd: string, fullCmd: string[], pidFile?: string): { cmd: string[]; detached: boolean } | null {
  const hasDisplay = Boolean(process.env.WAYLAND_DISPLAY || process.env.DISPLAY);

  // Windows has no xdg anything, and none of the terminals below exist there.
  // PowerShell is what a Windows user has open anyway. The command reaches it as
  // -EncodedCommand (base64 of UTF-16LE): a prompt with notes has newlines, which
  // end a cmd.exe command line, and semicolons, which Windows Terminal splits its
  // own arguments on -- neither survives as a plain -Command string. Windows
  // Terminal hosts the shell when installed; otherwise `start` gives it a window.
  if (process.platform === "win32") {
    const q = (a: string) => `'${a.replace(/'/g, "''")}'`;
    const shell = powershellExe();
    // This PowerShell's PID: ending its tree closes the -NoExit tab or window.
    const ps = `${pidFile ? `$PID | Set-Content -LiteralPath ${q(pidFile)}; ` : ""}Set-Location ${q(cwd)}; & ${fullCmd.map(q).join(" ")}`;
    const enc = Buffer.from(ps, "utf16le").toString("base64");
    // herdr (beta on Windows) first, as elsewhere: a new tab, and the run typed into
    // its PowerShell. Typed text ends at a newline, so what is typed is one line, the
    // same encoded command; -EncodedCommand is also not a script file, so an
    // execution policy that blocks .ps1 files does not stop it. The trailing exit
    // closes the tab once the run's PowerShell ends.
    const herdr = onPath("herdr");
    if (herdr && answers([herdr, "workspace", "list"])) {
      const typed = `& ${q(shell)} -NoProfile -EncodedCommand ${enc}; exit`;
      const launch = `$o = & ${q(herdr)} tab create --cwd ${q(cwd)} --label kaizen --focus | Out-String
if ($o -match '"pane_id":"([^"]*)"') { & ${q(herdr)} pane run $Matches[1] ${q(typed)} } else { exit 1 }`;
      return { cmd: [shell, "-NoProfile", "-EncodedCommand", Buffer.from(launch, "utf16le").toString("base64")], detached: false };
    }
    const wt = onPath("wt.exe");
    if (wt) {
      return { cmd: [wt, "-d", cwd, shell, "-NoExit", "-EncodedCommand", enc], detached: true };
    }
    // `start` reads a title only when quoted; an unquoted word is the command, so
    // "kaizen" here ran kaizen's own launcher. The empty title is what Bun quotes.
    return {
      cmd: [cmdExe(), "/c", "start", "", "/D", cwd, shell, "-NoExit", "-EncodedCommand", enc],
      detached: true,
    };
  }

  // Someone working inside a multiplexer wants the run there, not in a stray window.
  // The server is asked each time: the board outlives the multiplexer it was started
  // in, so $TMUX or $HERDR_ENV only says what was running then. herdr has no "new tab
  // running this", and what it sends a pane is typed into an interactive shell, which
  // eats tabs and quotes its own way -- so the line goes into a one-shot script and
  // only `exec sh <path>` is typed. The exec is what closes the tab when the agent
  // ends: left behind, the pane's own shell would sit at a prompt.
  // ponytail: the mktemp path is typed unquoted; quote it if a TMPDIR with spaces shows up.
  // The wrapper writes its PID and then becomes the agent, so the PID is the agent's
  // on every branch below, whatever terminal or launcher sits in front of it.
  if (pidFile) fullCmd = ["sh", "-c", 'echo $$ > "$0"; exec "$@"', pidFile, ...fullCmd];
  const line = fullCmd.map(shq).join(" ");
  // The one-shot scripts below end the tab when the agent ends, but a launch that
  // never started (126/127: not executable, not found) holds it open on its error.
  const hold = 's=$?; [ $s = 126 ] || [ $s = 127 ] || exit $s; printf "kaizen: the agent did not start. Press Enter to close. "; read _';
  if (answers(["herdr", "workspace", "list"])) {
    const script = `f=$(mktemp) && printf 'rm -f "$0"\\n%s\\n${hold}\\n' "$2" > "$f" && p=$(herdr tab create --cwd "$1" --label kaizen --focus | sed -n 's/.*"pane_id":"\\([^"]*\\)".*/\\1/p') && [ -n "$p" ] && herdr pane run "$p" "exec sh $f"`;
    return { cmd: ["sh", "-c", script, "sh", cwd, line], detached: false };
  }
  if (answers(["tmux", "has-session"])) {
    // Several arguments are run as they are; one would go through the default-shell.
    return { cmd: ["tmux", "new-window", "-c", cwd, ...fullCmd], detached: false };
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
    // One argument after -e is handed to the login shell, which may not be a POSIX one.
    if (Bun.which("xterm")) return { cmd: ["xterm", "-e", "sh", "-c", 'cd "$1" && shift && exec "$@"', "sh", cwd, ...fullCmd], detached: true };
  }

  if (process.platform === "darwin") {
    // Terminal types what it is given into the login shell, so, as with herdr, the
    // line goes into a one-shot script and only `exec sh <path>` is typed. Whether the
    // window closes when that ends is a profile setting kaizen cannot reach, so the
    // launcher waits for the tab to run something, then to run nothing, and closes it:
    // a tab with nothing running closes without Terminal asking first.
    // ponytail: untested on a real Mac; the try leaves the window as it was if any step fails.
    const close = ["tell application \"Terminal\"", "set t to do script \"exec sh $f\"", "activate", "try",
      "repeat 150 times", "if busy of t then exit repeat", "delay 0.2", "end repeat",
      "repeat while busy of t", "delay 1", "end repeat",
      "repeat with w in windows", "if tabs of w contains t then close w", "end repeat",
      "end try", "end tell"].map((l) => `-e ${JSON.stringify(l)}`).join(" ");
    const script = `f=$(mktemp) && printf 'rm -f "$0"\\n{ cd %s || (exit 127); } && %s\\n${hold}\\n' "$1" "$2" > "$f" && osascript ${close}`;
    return { cmd: ["/bin/sh", "-c", script, "sh", shq(cwd), line], detached: true };
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
  return readText(REGISTRY).split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map(nativePath)
    .filter((d, i, all) => all.indexOf(d) === i);
}

// On Windows the registry is also written by agents running Git Bash, which says
// /c/Users/me/proj or C:/Users/me/proj. Read as is, the first is C:\c\Users\..., a
// folder that does not exist, and the project drops off the board. One spelling
// per folder, drive letter upper case, so the same project is not listed twice.
export function nativePath(p: string) {
  if (process.platform !== "win32") return p;
  return win32.resolve(p.replace(/^\/([a-zA-Z])(?=\/|$)/, "$1:/")).replace(/^[a-z]:/, (d) => d.toUpperCase());
}

// Never fails the command that triggered it: a read-only home is not a reason for a
// dashboard to stop opening.
export function remember(projectDir: string) {
  try {
    projectDir = nativePath(projectDir);
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

// The same spelling knownProjects() gives: a terminal handing out c:\... (lower-case
// drive) would otherwise make every POST from the board fail "unknown state dir".
export function locate() {
  let dir = nativePath(process.cwd());
  for (;;) {
    if (existsSync(join(dir, ".kaizen"))) return join(dir, ".kaizen");
    if (existsSync(join(dir, ".git"))) return null;
    const up = dirname(dir);
    if (up === dir) return existsSync(join(home, ".kaizen")) ? nativePath(join(home, ".kaizen")) : null;
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
      const s = JSON.parse(readText(file));
      // When the run last moved. Kaizen records no liveness signal, so the file's
      // own mtime is the only evidence that anything is still working on it.
      let moved = 0;
      try { moved = statSync(file).mtimeMs; } catch { /* vanished mid-read */ }
      return [{ id, stage: s.stage ?? "?", awaiting: s.awaiting ?? null, moved, runner: s.runner, agent: s.agent }];
    } catch { return []; }
  }).reverse();
}

// The finished runs beyond the newest `keep`, oldest first; with `apply`, deleted.
// A run still in plan, build or review is never a candidate, whatever its age. A
// done run's open backlog items move to the orphanage first; an abandoned run's are
// not open work and go with it.
export function pruneRuns(state: string, keep: number, apply = false): { id: string; rescued: number }[] {
  const finished = readRuns(state).filter((r) => r.stage === "done" || r.stage === "abandoned");
  return finished.slice(Math.max(0, keep)).reverse().map((r) => {
    const dir = join(state, "runs", r.id);
    const open = r.stage === "done" ? readBacklog(join(dir, "06-backlog.md")) : [];
    if (apply) {
      const orphanage = join(state, "backlog.md");
      const gap = existsSync(orphanage) && !readText(orphanage).endsWith("\n") ? "\n" : "";
      if (open.length) appendFileSync(orphanage, gap + open.map((i) => `- open: ${i} | from ${r.id}\n`).join(""));
      rmSync(dir, { recursive: true, force: true });
    }
    return { id: r.id, rescued: open.length };
  });
}

// True when the last fix of the run's fix loop was never rechecked: the highest
// NN-fix.md in 05-iterations/ has no NN-recheck.md beside it.
export function unrechecked(state: string, id: string) {
  const dir = join(state, "runs", id, "05-iterations");
  if (!existsSync(dir)) return false;
  const files = readdirSync(dir);
  const last = files.filter((f) => /^\d+-fix\.md$/.test(f)).sort().pop();
  return !!last && !files.includes(last.replace("-fix.md", "-recheck.md"));
}

// Open items are the ones worth a number; done and rejected stay as record.
export function backlog(state: string) {
  const files = [join(state, "backlog.md")];
  const runs = join(state, "runs");
  if (existsSync(runs)) for (const id of readdirSync(runs)) files.push(join(runs, id, "06-backlog.md"));
  let n = 0;
  for (const f of files) {
    if (!existsSync(f)) continue;
    n += (readText(f).match(/^\s*-\s*open:/gm) ?? []).length;
  }
  return n;
}

export function version(repo: string) {
  try { return JSON.parse(readText(join(repo, "package.json"))).version; } catch { return ""; }
}
// The global state directory is not a project and has no parent worth naming.
export function label(stateDir: string) {
  return stateDir === join(home, ".kaizen") ? "no project" : tilde(dirname(stateDir));
}

export function tilde(p: string) { return p.startsWith(home) ? "~" + p.slice(home.length) : p; }

// The first few real lines of a file's body, blank lines and headings dropped.
export function section(file: string, n: number) {
  if (!existsSync(file)) return [];
  return readText(file).split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .slice(0, n);
}

export function readFindings(file: string) {
  if (!existsSync(file)) return [];
  return readText(file).split("\n")
    .map((l) => l.trim())
    .filter((l) => /^\d+\.\s/.test(l) || /\b(critical|high|medium|low)\b:/.test(l));
}

// The review's numbered findings, under its Findings heading when it has one. The
// number is the reviewer's own, which is how a fix names a finding. `done` is what
// the run's backlog says was fixed or rejected, by number or by the finding's text,
// or what a recheck in the fix loop called closed before the backlog was written.
// ponytail: a recheck is prose, matched as "Finding <n> — closed"; one that numbers
// its own findings instead of the review's would close the wrong line here.
export function reviewFindings(state: string, id: string) {
  const base = join(state, "runs", id);
  const read = (f: string) => {
    const p = join(base, f);
    return existsSync(p) ? readText(p).split("\n").map((l) => l.trim()) : [];
  };
  let lines = read("04-review.md");
  const at = lines.findIndex((l) => /^#+\s*findings/i.test(l));
  if (at >= 0) {
    // Sub-headings group findings; only a heading at the section's own level ends it.
    const depth = (l: string) => /^#*/.exec(l)![0].length;
    const end = lines.findIndex((l, i) => i > at && depth(l) > 0 && depth(l) <= depth(lines[at]!));
    lines = lines.slice(at + 1, end < 0 ? undefined : end);
  }
  const closed = read("06-backlog.md").flatMap((l) => /^-\s*(?:done|rejected):\s*(.*)$/.exec(l)?.[1] ?? []);
  const iter = join(base, "05-iterations");
  const rechecked = new Set((existsSync(iter) ? readdirSync(iter) : []).filter((f) => f.endsWith("-recheck.md"))
    .flatMap((f) => [...readText(join(iter, f)).matchAll(/finding\s+(\d+)\W{1,8}closed/gi)].map((m) => Number(m[1]))));
  return lines.flatMap((l) => {
    const m = /^(\d+)\.\s+(.+)$/.exec(l);
    if (!m) return [];
    const n = Number(m[1]);
    return [{ n, text: m[2]!, done: rechecked.has(n) || closed.some((c) => c.startsWith(`${n}. `) || c.includes(m[2]!)) }];
  });
}

// The numbers a fix request may name: every one an open finding of this review, or
// null. One that is not refuses the lot, so a stale page never fixes half of what it showed.
export function pickFindings(state: string, id: string, nums: unknown): number[] | null {
  const want = new Set<unknown>(Array.isArray(nums) ? nums : []);
  const got = reviewFindings(state, id).filter((f) => !f.done && want.has(f.n)).map((f) => f.n);
  return got.length && got.length === want.size ? got : null;
}

// What the agent is launched with to fix picked findings: the run and the numbers,
// nothing else. launchRun puts `/kaizen ` in front.
export function fixPrompt(id: string, nums: number[]) {
  return `run ${id}: fix finding${nums.length === 1 ? "" : "s"} ${nums.join(", ")} from its 04-review.md and recheck. `
    + `Leave every other finding alone, and mark the fixed ones done in its 06-backlog.md.`;
}

// The board's answer to an approval the run is waiting on. The comment is collapsed to
// one line: where the prompt is typed into a shell (herdr), a newline sends it early.
// Answers are the plan's open questions answered at the approval, one per question.
export function approvalPrompt(id: string, awaiting: string, why?: string, answers?: string[]) {
  const plan = awaiting === "approvals.plan";
  const one = (t: string) => t.replace(/\s+/g, " ").trim();
  const note = why === undefined ? undefined : one(why);
  if (plan && !note && answers?.length) return `run ${id}: the plan is approved from the board, with answers to its open questions: `
    + answers.map((a, i) => `${i + 1}) ${one(a).replace(/[.;]$/, "")}`).join("; ") + `. Record them in 02-approval.md and build the plan with them.`;
  if (!note) return plan
    ? `run ${id}: the plan is approved from the board. Record it in 02-approval.md and build it, first asking any of its open questions still unanswered.`
    : `run ${id}: the work is approved from the board at the final approval. Record it, write the backlog and finish the run.`;
  return plan
    ? `run ${id}: the plan is sent back from the board to revise: "${note}". Record it in 02-approval.md, revise 01-plan.md with it, and stop at the plan approval again.`
    : `run ${id}: the work is sent back from the board at the final approval: "${note}". Record it in 02-approval.md, change the work to address it, recheck, and stop at the final approval again.`;
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
  return readText(file).split("\n")
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
  tags?: string[];                                 // runs only: runner, agent, "yolo", "unrechecked"
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
    try { out.push(normalise(readText(join(dir, id, "00-request.md")))); }
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
  for (const raw of readText(f).split("\n")) {
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
  try { return readText(join(state, "runs", id, "notes.md")); } catch { return ""; }
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

// What a card is worth interrupting someone for, in the words both UIs send: a run
// that wants a decision, or one that finished. Null for everything else. The second
// line is the project, since a notification outlives the board that raised it.
const NEED: Record<string, string> = {
  "approvals.plan": "plan needs your approval",
  "approvals.review": "review needs your approval",
  "approvals.each_file": "an edit needs your approval",
  findings: "pick the findings to fix",
};
export function notice(c: Card): string | null {
  if (c.kind !== "run") return null;
  const what = c.awaiting ? NEED[c.awaiting] ?? `waiting on ${c.awaiting}` : c.status === "done" ? "done" : null;
  return what && `${c.text} — ${what}\n${c.where}`;
}

// When a notice is worth sending, for both UIs: each keeps one of these, and the
// board page is served this very function, so it must stand on its own -- no
// imports, no outer names. A run never seen before says nothing, which covers first
// load and a run arriving already waiting. A `done` within a minute of the run
// leaving a wait was finished by the person's own decision, so that one stays quiet.
// ponytail: a fixed minute; an approval whose last writes take longer still pings.
export function notifier() {
  const said = new Map<string, string | null>(), left = new Map<string, number>();
  return (key: string, say: string | null, done: boolean, now: number) => {
    const before = said.get(key);
    said.set(key, say);
    if (before && say !== before) left.set(key, now);
    return before !== undefined && !!say && say !== before && !(done && now - (left.get(key) ?? -Infinity) < 60_000);
  };
}

export const LOGO = join(dirname(import.meta.dir), "assets", "kaizen-logo.png");

// Best effort: a machine without notify-send loses the notification, not the board.
export function notifyArgs(body: string) {
  return ["notify-send", "-a", "kaizen", ...(existsSync(LOGO) ? ["-i", LOGO] : []), "kaizen", body];
}
export function notify(body: string) {
  try {
    if (!Bun.which("notify-send")) return;
    Bun.spawn(notifyArgs(body), {
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
    const run = JSON.parse(readText(file));
    if (run.stage === "abandoned") return "That run is already abandoned.";
    run.stage = "abandoned";
    run.awaiting = null;
    run.updated = new Date().toISOString();
    writeFileSync(file, JSON.stringify(run, null, 2) + "\n");
    // The reason belongs in the record, not in state.json, whose shape is the
    // resume contract every kaizen tool reads.
    appendFileSync(join(st, "runs", id, "02-approval.md"),
      `\n---\n\n## Abandoned\n\n${new Date().toISOString()} — abandoned from the board.\n\n${why}\n`);
    closeSessions(st, id);
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
  return new Set(readText(f).split("\n")
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
    if (!bodies.has(f)) { try { bodies.set(f, readText(f)); } catch { bodies.set(f, ""); } }
    return bodies.get(f)!;
  };
  const requests: string[] = [];
  // Each request line on its own, quote and list markers stripped: what an idea
  // nobody launched from the board is matched against.
  const lines: string[] = [];
  for (const st of [...states, ...knownProjects().map((d) => join(d, ".kaizen")), join(home, ".kaizen")]
    .filter((d, i, all) => all.indexOf(d) === i && existsSync(join(d, "runs")))) {
    for (const id of readdirSync(join(st, "runs"))) { const b = body(st, id); if (!b) continue;
      requests.push(normalise(b));
      for (const l of b.split("\n")) lines.push(normalise(l.replace(/^[\s>*"'`-]+|[\s"'`.]+$/g, "")));
    }
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
      // An idea that was launched only has to appear somewhere in a request. One
      // that was not must be what a request line says (after any `/kaizen lite`
      // prefix): a short idea like "test" is a substring of half the requests
      // ever written, and would vanish the moment it was added.
      const t = normalise(it.text);
      if (it.status === "started" ? requests.some((r) => r.includes(t)) : lines.some((l) => l === t || l.endsWith(" " + t))) continue;
      next.push(it.status === "started"
        ? { kind: "idea", status: "starting", text: it.text, state: st, where, column: 1, awaiting: null, dim: true, archived: false, notes: it.notes }
        : { kind: "idea", status: "idea", text: it.text, state: st, where, column: 0, awaiting: null, dim: false, archived: it.status === "archived", notes: it.notes });
    }
    // Runs started in Yolo. Only yolo records are matched to runs, so a project that
    // never used it pays one directory read.
    const yolos = new Set(readSessions(st).filter((s) => s.yolo).map((s) => ownerOf(st, s)));
    for (const r of readRuns(st)) {
      next.push({
        kind: "run", id: r.id, status: statusOf(r, now), text: short(r.id), state: st, where, column: columnOf(r.stage, r.awaiting), moved: r.moved,
        title: requestTitle(body(st, r.id)),
        awaiting: r.stage === "abandoned" ? null : r.awaiting,
        dim: r.stage === "abandoned",
        archived: archive.has(r.id),
        tags: [r.runner, r.agent, yolos.has(r.id) ? "yolo" : undefined, unrechecked(st, r.id) ? "unrechecked" : undefined].filter((t): t is string => !!t),
        notes: readNotes(st, r.id) || undefined,
      });
    }
  }
  // Done reads newest first: by `moved`, the time each card prints as its age.
  // Sorted into the slots the done cards already hold, so no other card moves.
  const done = next.filter((k) => k.column === 4).sort((a, b) => (b.moved ?? 0) - (a.moved ?? 0));
  let i = 0;
  return next.map((k) => (k.column === 4 ? done[i++]! : k));
}

// What starting a run needs, minus the screens: the TUI and the web board both
// launch the same way and only differ in how they tell the user.
export type Launch =
  | { ok: true; agent: Agent; prompt: string; projectDir: string; cmd: string[] }
  | { ok: false; agent: Agent; prompt: string; projectDir: string; manual: string; why: string };

export function projectOf(from: string) {
  return from === join(home, ".kaizen")
    ? process.cwd()
    : (from.endsWith(".kaizen") ? dirname(from) : from);
}

export function manualCommand(projectDir: string, agentCmd: string, prompt: string, flags: string[] = []) {
  const bin = [agentCmd, ...flags, ...(PROMPT_FLAGS[agentCmd] ?? [])].join(" ");
  // Pasted into whatever shell the user has. fish reads \' and \\ inside single
  // quotes as escapes, so ' and \ each go in double quotes, which sh and fish read alike.
  const q = (a: string) => `'${a.replace(/['\\]/g, (ch) => (ch === "'" ? `'"'"'` : `'"\\\\"'`))}'`;
  return process.platform === "win32"
    ? `cd '${projectDir}'; & ${bin} '${prompt.replace(/'/g, "''")}'`
    : `cd ${q(projectDir)} && ${bin} ${q(prompt)}`;
}

// Agent sessions kaizen opened. Each launch leaves `sessions/<key>.json` in the
// project's state dir ({run, text, cmd, model, sessionId, started}) and `<key>.pid`, which
// the agent writes itself. Only these are ever closed or resumed: a session the user
// opened by hand has no record.
export type Session = { key: string; run: string | null; text: string; cmd: string; model?: string | null; yolo?: boolean; sessionId: string | null; started: number };

// Tools that take a conversation id at launch and resume it by that id. Every other
// tool gets a fresh session on each decision, as before.
const SESSION_FLAGS: Record<string, { start: (id: string) => string[]; resume: (id: string) => string[]; transcript: (cwd: string, id: string) => string }> = {
  claude: {
    start: (id) => ["--session-id", id],
    resume: (id) => ["--resume", id],
    transcript: (cwd, id) => join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects", cwd.replace(/[^A-Za-z0-9]/g, "-"), `${id}.jsonl`),
  },
};

export const CLOSE_GRACE_MS = 2 * 60_000;
const sessionsDir = (st: string) => join(st, "sessions");

export function readSessions(st: string): Session[] {
  const dir = sessionsDir(st);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json")).flatMap((f) => {
    try { return [{ ...JSON.parse(readText(join(dir, f))), key: f.slice(0, -5) }]; } catch { return []; }
  }).sort((a, b) => a.started - b.started);
}

// Whose session a record is. A decision's launch names its run. An idea's launch came
// before its run existed, so it belongs to the first run created after it whose
// request holds the idea's text: one run per record, never every run that mentions it.
export function ownerOf(st: string, s: Session): string | null {
  if (s.run) return s.run;
  const t = normalise(s.text);
  let best: string | null = null, at = Infinity;
  try {
    for (const id of readdirSync(join(st, "runs"))) {
      try {
        const f = join(st, "runs", id, "00-request.md");
        const st2 = statSync(f), born = st2.birthtimeMs || st2.mtimeMs;
        // A second of slack: file times come from a coarser clock than Date.now().
        if (born >= s.started - 1000 && born < at && normalise(readText(f)).includes(t)) { best = id; at = born; }
      } catch { /* no request yet */ }
    }
  } catch { /* no runs dir */ }
  return best;
}

// agent.close in the config chain: on unless it says off.
export function closeEnabled(projectDir: string) {
  for (const f of [join(projectDir, ".kaizen", "config.yml"), join(home, ".kaizen", "config.yml")]) {
    try {
      const m = /^agent:\n(?:[ \t]+.*\n)*?[ \t]+close:[ \t]*(\S+)/m.exec(readText(f));
      if (m) return !/^(off|false|no)$/i.test(m[1]);
    } catch { /* absent */ }
  }
  return true;
}

// Whether a live PID is still the agent a record launched, not a stranger that reused
// the number: the tool's name (and conversation id) in its arguments, started no
// earlier than the record. On Windows the PID is the PowerShell kaizen opened.
function isSession(pid: number, s: Session): boolean {
  try {
    if (process.platform === "win32") {
      const out = Bun.spawnSync([sysExe("tasklist.exe"), "/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { stdin: "ignore", timeout: 5000, windowsHide: true }).stdout.toString();
      return /^"(powershell|pwsh)\.exe"/i.test(out.trim());
    }
    const ps = onPath("ps");
    if (!ps) return false;
    const m = /^\s*(\S+)\s+(.*)$/.exec(Bun.spawnSync([ps, "-o", "etime=,args=", "-p", String(pid)], { stdin: "ignore", timeout: 5000 }).stdout.toString().trim());
    if (!m) return false;
    // etime is [[dd-]hh:]mm:ss
    const [d, rest] = m[1].includes("-") ? m[1].split("-") : ["0", m[1]];
    const secs = rest.split(":").reduce((a, n) => a * 60 + Number(n), 0) + Number(d) * 86400;
    return Date.now() - secs * 1000 >= s.started - 2000 && m[2].includes(s.cmd) && (!s.sessionId || m[2].includes(s.sessionId));
  } catch {
    return false;
  }
}

// End one recorded session if it is still running, and drop its PID file either way:
// without one, the record is never looked at for closing again.
function closeOne(st: string, s: Session): boolean {
  const pidFile = join(sessionsDir(st), s.key + ".pid");
  let closed = false;
  try {
    const pid = parseInt(readText(pidFile));
    if (pid > 0 && isSession(pid, s)) {
      if (process.platform === "win32") Bun.spawnSync([sysExe("taskkill.exe"), "/T", "/F", "/PID", String(pid)], { stdin: "ignore", stdout: "ignore", stderr: "ignore", timeout: 5000, windowsHide: true });
      else process.kill(pid, "SIGTERM");
      closed = true;
    }
  } catch { /* already gone */ }
  rmSync(pidFile, { force: true });
  return closed;
}

const openSessions = (st: string) => readSessions(st).filter((s) => existsSync(join(sessionsDir(st), s.key + ".pid")));

// Close every session kaizen opened for a run, those launched before `before` only,
// so a decision's own successor is never caught. The record stays: it holds the
// conversation id the next decision resumes. Never throws.
export function closeSessions(st: string, id: string, opts: { before?: number } = {}): number {
  try {
    if (!closeEnabled(dirname(st))) return 0;
    return openSessions(st).filter((s) => s.started < (opts.before ?? Infinity) && ownerOf(st, s) === id).filter((s) => closeOne(st, s)).length;
  } catch { return 0; }
}

// The board's minute sweep: sessions of runs done for longer than the grace, so the
// final summary can still be read first. Only sessions launched before the run last
// moved: a fix started on a done run leaves it done until that agent writes, and is
// the one doing the work. Abandoned runs are closed by abandonRun, not here.
export function sweepSessions(st: string, now: number) {
  try {
    const live = openSessions(st);
    if (!live.length || !closeEnabled(dirname(st))) return;
    const runs = new Map(readRuns(st).map((r) => [r.id, r]));
    for (const s of live) {
      const r = runs.get(ownerOf(st, s) ?? "");
      if (r && r.stage === "done" && s.started <= r.moved && now - r.moved >= CLOSE_GRACE_MS) closeOne(st, s);
    }
  } catch { /* the next sweep tries again */ }
}

// The run's conversation to continue: its first recorded one, on this tool, whose
// transcript is still on disk. None means a fresh session, never a guess.
export function firstSession(st: string, id: string, cmd: string, cwd: string): Session | null {
  const f = SESSION_FLAGS[cmd];
  if (!f) return null;
  return readSessions(st).find((s) => s.sessionId && s.cmd === cmd && ownerOf(st, s) === id && existsSync(f.transcript(cwd, s.sessionId))) ?? null;
}

// The tool and model a run was started with: its latest recorded launch, else the
// agent its state.json names. A decision continues on these whatever the config says now.
export function runAgent(st: string, id: string): { cmd: string; model: string | null } | null {
  const s = readSessions(st).filter((x) => ownerOf(st, x) === id).pop();
  if (s) return { cmd: s.cmd, model: s.model ?? null };
  try {
    const a = JSON.parse(readText(join(st, "runs", id, "state.json"))).agent;
    if (typeof a === "string" && a) return { cmd: a, model: null };
  } catch { /* no run */ }
  return null;
}

// The agent's argv for a launch, and its record. With a run, a decision: it resumes
// the run's conversation when there is one. A project without a state dir gets no
// record; making one here would shadow the user's.
export function sessionLaunch(projectDir: string, cmd: string, base: string[], prompt: string, text: string, run?: string, model?: string, yolo?: boolean) {
  const st = join(projectDir, ".kaizen");
  if (!existsSync(st)) return { fullCmd: [...base, ...promptArgs(cmd, prompt)], pidFile: undefined, record: undefined };
  const f = SESSION_FLAGS[cmd];
  const prev = run ? firstSession(st, run, cmd, projectDir) : null;
  const sessionId = f ? prev?.sessionId ?? crypto.randomUUID() : null;
  const fullCmd = [...base, ...(f && sessionId ? (prev ? f.resume(sessionId) : f.start(sessionId)) : []), ...promptArgs(cmd, prompt)];
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  mkdirSync(sessionsDir(st), { recursive: true });
  const record = join(sessionsDir(st), key + ".json");
  writeFileSync(record, JSON.stringify({ run: run ?? null, text, cmd, model: model ?? null, ...(yolo ? { yolo: true } : {}), sessionId, started: Date.now() }) + "\n");
  return { fullCmd, pidFile: join(sessionsDir(st), key + ".pid"), record };
}

// run: the run a decision is for. Without it, an idea starting a new run.
// pick: the tool, model and yolo chosen for a new run; a decision takes the run's own
// tool and model, and never yolo.
export function launchRun(it: Item, from: string, run?: string, pick: { agent?: string; model?: string; yolo?: boolean } = {}): Launch {
  const projectDir = projectOf(from);
  // The run will be born here; the board must know the dir or the idea never retires.
  remember(projectDir);
  const own = run && !pick.agent ? runAgent(join(projectDir, ".kaizen"), run) : null;
  const agent = detectDefaultAgent(projectDir, pick.agent ?? own?.cmd);
  const agentBin = Bun.which(agent.cmd) ?? agent.cmd;
  const prompt = requestOf(it.where ? `/kaizen ${it.text} (${it.where})` : `/kaizen ${it.text}`, it.notes, from);
  const wanted = pick.model ?? (own?.cmd === agent.cmd ? own.model : null) ?? undefined;
  const model = wanted && plainModel(wanted) ? wanted : undefined;
  // Yolo was picked for one tool; a fallback to another opens in its normal mode.
  const yolo = !!pick.yolo && agent.cmd === pick.agent && !!YOLO_FLAGS[agent.cmd];
  const flags = [...agentFlags(projectDir, agent.cmd, undefined, model), ...(yolo ? YOLO_FLAGS[agent.cmd] : [])];
  // The idea as its run's request will hold it: without the runner word in front.
  const s = sessionLaunch(projectDir, agent.cmd, [agentBin, ...flags], prompt, it.text.replace(/^(lite|full|auto|plan)\s+/i, ""), run, model, yolo);
  const manual = manualCommand(projectDir, agent.cmd, prompt, flags);
  const drop = () => { if (s.record) rmSync(s.record, { force: true }); };

  const term = findTerminal(projectDir, s.fullCmd, s.pidFile);
  if (!term) {
    drop();
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
      // A detached launch is the terminal window itself; anything else (herdr's
      // launcher) is plumbing, and must not flash a console on Windows.
      windowsHide: !term.detached,
    });
    if (term.detached) proc.unref();
    return { ok: true, agent, prompt, projectDir, cmd: term.cmd };
  } catch (err: any) {
    drop();
    return { ok: false, agent, prompt, projectDir, manual, why: err?.message ?? String(err) };
  }
}

// Whoever holds the board's port, by the OS's own accounting.
export async function pidOnPort(port: number): Promise<number | null> {
  try {
    if (process.platform === "win32") {
      const out = await Bun.$`${sysExe("netstat.exe")} -ano -p tcp`.text();
      const m = new RegExp(`127\\.0\\.0\\.1:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`).exec(out);
      return m ? Number(m[1]) : null;
    }
    const out = await Bun.$`lsof -t -iTCP:${port} -sTCP:LISTEN`.quiet().nothrow().text();
    return Number(out.trim().split("\n")[0]) || null;
  } catch { return null; }
}

// ---- git, for the board's commit and push. Always argv, never a shell: the commit
// message is whatever the user typed. A credential prompt has no terminal to appear
// in, so git is told not to ask and is given a minute at most.
// windowsHide: a board started from the Windows shortcut has no console, so each
// git it runs would open one of its own -- a window flashing on every refresh.
const gitOpts = () => ({ env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }, stdin: "ignore" as const, timeout: 60_000, windowsHide: true });
const gitDone = (code: number | null, stdout: string, stderr: string) => {
  const out = stdout.trimEnd(), err = stderr.trim();
  return { ok: code === 0, out, why: (err || out).split("\n").pop() || "git did not finish" };
};
const NO_GIT = { ok: false, out: "", why: "git is not installed" };
function git(dir: string, ...args: string[]) {
  // spawnSync throws when git is not installed; to the board that is just "no repo".
  let r;
  try { r = Bun.spawnSync(["git", "-C", dir, ...args], gitOpts()); } catch { return NO_GIT; }
  return gitDone(r.exitCode, r.stdout.toString(), r.stderr.toString());
}
// The same, without holding the server: for the push, the one call that waits on a network.
async function gitAsync(dir: string, ...args: string[]) {
  try {
    const p = Bun.spawn(["git", "-C", dir, ...args], { ...gitOpts(), stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    return gitDone(code, out, err);
  } catch { return NO_GIT; }
}

export type GitStatus = { repo: false } | { repo: true; branch: string; remote: string; files: string[]; ahead: number; others?: number; shared?: string[] };

// A project the board can commit for: a git work tree with somewhere to push.
export function gitStatus(projectDir: string): GitStatus {
  if (!git(projectDir, "rev-parse", "--is-inside-work-tree").ok) return { repo: false };
  const remote = git(projectDir, "remote").out.split("\n")[0] ?? "";
  if (!remote) return { repo: false };
  // Every untracked file on its own line: a new directory is never committed whole.
  const st = git(projectDir, "status", "--porcelain", "--untracked-files=all").out;
  // No upstream yet means nothing of this branch is on the remote: any commit is ahead.
  const up = git(projectDir, "rev-list", "--count", "@{u}..HEAD");
  const ahead = up.ok ? Number(up.out) : git(projectDir, "rev-parse", "HEAD").ok ? 1 : 0;
  return { repo: true, branch: git(projectDir, "branch", "--show-current").out, remote, files: st ? st.split("\n") : [], ahead };
}

// The path of a `git status --porcelain` line; for a rename, the new one.
// ponytail: only the surrounding quotes are undone, so a name git escapes (non-ASCII,
// a quote, a backslash) never matches a report; read `status -z` if that comes up.
const statusPath = (line: string) => line.slice(3).split(" -> ").pop()!.replace(/^"|"$/g, "");

// What a run reported changing: 03-impl.md and its fix rounds, and when the newest
// of them was written.
function runReport(state: string, id: string) {
  const base = join(state, "runs", id), its = join(base, "05-iterations");
  const fixes = existsSync(its) ? readdirSync(its).filter((n) => n.endsWith("-fix.md")).map((n) => join(its, n)) : [];
  let text = "", at = 0;
  for (const f of [join(base, "03-impl.md"), ...fixes]) try { text += readText(f) + "\n"; at = Math.max(at, statSync(f).mtimeMs); } catch {}
  return { text, at };
}
const names = (report: string, path: string) => report.includes("`" + path + "`") || report.includes("`" + path + ":");

type Report = { id: string; text: string; at: number };
function runReports(state: string): Report[] {
  let ids: string[] = [];
  try { ids = readdirSync(join(state, "runs")); } catch {}
  return ids.map((id) => ({ id, ...runReport(state, id) }));
}
const runFiles = (changed: string[], mine: Report, rest: Report[]) => changed.filter((l) => {
  const p = statusPath(l);
  return names(mine.text, p) && !rest.some((r) => r.at > mine.at && names(r.text, p));
});

// The project's status narrowed to one run: a changed file is the run's when its
// report names the path in backticks and no run that reported later names it too,
// so a finished run is not offered the work of the ones after it. `others` counts
// the changed files left for other runs. `shared` says which of this run's files
// also hold an earlier run's work: one that named the file and reported after the
// file was last committed. A file is committed whole, so the user is told whose.
// ponytail: runs in the same file are named, not separated; that takes a worktree
// per run or a saved patch per run.
export function runGit(state: string, id: string): GitStatus {
  const dir = dirname(state), s = gitStatus(dir);
  if (!s.repo) return s;
  const all = runReports(state), mine = all.find((r) => r.id === id) ?? { id, text: "", at: 0 };
  const rest = all.filter((o) => o.id !== id);
  const files = runFiles(s.files, mine, rest);
  const shared = files.flatMap((l) => {
    const p = statusPath(l);
    const since = Number(git(dir, "--literal-pathspecs", "log", "-1", "--format=%ct", "--", p).out) * 1000;
    const who = rest.filter((r) => r.at > since && names(r.text, p)).map((r) => short(r.id));
    return who.length ? [`${p}: ${who.join(", ")}`] : [];
  });
  return { ...s, files, others: s.files.length - files.length, shared };
}

// What the board did for a run, kept beside the run and not in state.json, whose
// mtime is the liveness signal.
export function readCommit(state: string, id: string): { sha: string; pushed: boolean } | null {
  try {
    const t = readText(join(state, "runs", id, "07-commit.md"));
    return { sha: /^commit: (\S+)/m.exec(t)?.[1] ?? "", pushed: /^pushed: yes/m.test(t) };
  } catch { return null; }
}

// The card's git mark for each run asked about, by the rules of the panel's button
// (`gitBtn` in web/board.html): one project status and one read of the reports for
// the lot. A run with nothing to say either way gets no entry.
export function cardsGit(state: string, ids: string[]): Record<string, "pending" | "pushed"> {
  const s = gitStatus(dirname(state)), out: Record<string, "pending" | "pushed"> = {};
  if (!s.repo) return out;
  const all = runReports(state);
  for (const id of ids) {
    const mine = all.find((r) => r.id === id) ?? { id, text: "", at: 0 }, k = readCommit(state, id);
    const files = runFiles(s.files, mine, all.filter((o) => o.id !== id)).length;
    if (files) out[id] = "pending";
    else if (k?.pushed) out[id] = "pushed";
    else if (s.ahead > 0) out[id] = "pending";
    else if (k || mine.text) out[id] = "pushed";
  }
  return out;
}

// A Conventional Commits subject: every commit the board makes says what kind it is.
const COMMIT_TYPES = ["feat", "fix", "refactor", "perf", "docs", "test", "build", "ci", "chore", "style", "revert"];
const COMMIT_TYPE = new RegExp(`^(${COMMIT_TYPES.join("|")})(\\([^)\\n]+\\))?!?: \\S`);

// Commits the run's changed files (`runGit`) when there are any, then pushes. The record
// is written after the commit and again after the push, so a push that failed reads
// as committed and not pushed. `shown` is the file list the user confirmed: anything
// that changed since is refused, not swept in unseen.
export async function commitPush(state: string, id: string, message: string, shown: string[]): Promise<{ ok: true; sha: string } | { ok: false; why: string }> {
  const dir = dirname(state);
  const s = runGit(state, id);
  if (!s.repo) return { ok: false, why: "This project has no git remote." };
  if (s.files.join("\n") !== shown.join("\n")) return { ok: false, why: "The changed files are no longer the ones shown. Look at the list again." };
  if (s.files.length) {
    if (!message.trim()) return { ok: false, why: "A commit message is required." };
    if (!COMMIT_TYPE.test(message.trim())) return { ok: false, why: `Start the message with a type (${COMMIT_TYPES.join(", ")}), then a colon. For example, fix(web): what changed.` };
    // By path, both times: a file staged by hand for another run stays out of this commit.
    // Literal, so a file named `a*.txt` is that file and not a pattern.
    const paths = s.files.map(statusPath), lit = "--literal-pathspecs";
    for (const args of [[lit, "add", "-A", "--", ...paths], [lit, "commit", "-m", message.trim(), "--", ...paths]]) {
      const r = git(dir, ...args);
      if (!r.ok) return { ok: false, why: r.why };
    }
  }
  const sha = git(dir, "rev-parse", "--short", "HEAD").out;
  const record = (pushed: boolean) => writeFileSync(join(state, "runs", id, "07-commit.md"), `commit: ${sha}\npushed: ${pushed ? "yes" : "no"}\n`);
  record(false);
  const p = await (git(dir, "rev-parse", "--abbrev-ref", "@{u}").ok ? gitAsync(dir, "push") : gitAsync(dir, "push", "-u", s.remote, "HEAD"));
  if (!p.ok) return { ok: false, why: `${sha} is committed but not pushed: ${p.why}` };
  record(true);
  return { ok: true, sha };
}

// ---- issue reports

// Where a bug report goes: package.json's repository, so a fork reports to itself.
export const REPO_URL = (() => {
  try {
    const u = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")).repository.url as string;
    return u.replace(/^git\+/, "").replace(/\.git$/, "");
  } catch { return "https://github.com/hfadhlullah/kaizen"; }
})();

// The machine, as an issue's Environment field. Nothing that names the person: no
// hostname, no username, no paths.
export function systemInfo(): string {
  let osName = osVersion();
  try {
    if (process.platform === "linux") osName = /^PRETTY_NAME="?([^"\n]*)/m.exec(readFileSync("/etc/os-release", "utf8"))?.[1] || osName;
    else if (process.platform === "darwin") osName = `macOS ${Bun.spawnSync(["sw_vers", "-productVersion"]).stdout.toString().trim()}`;
  } catch { /* the kernel's own version string is still an answer */ }
  let kaizen = "?";
  try { kaizen = JSON.parse(readFileSync(join(import.meta.dir, "..", "package.json"), "utf8")).version; } catch {}
  const cpu = cpus();
  return [
    `kaizen: ${kaizen}`,
    `OS: ${osName} (${process.platform} ${release()}, ${arch()})`,
    `CPU: ${cpu[0]?.model.trim() ?? "?"} × ${cpu.length}`,
    `RAM: ${Math.round(totalmem() / 2 ** 30)} GB`,
    `bun: ${Bun.version}`,
    `terminal: ${process.env.TERM_PROGRAM ?? process.env.TERM ?? "?"}`,
  ].join("\n");
}

// The home folder as `~`, so a pasted error does not carry the username. Windows paths
// also arrive JSON-escaped (`C:\\Users\\x`) or with forward slashes, in any case.
export function scrubHome(s: string, homes = [home, homedir()], win = process.platform === "win32"): string {
  const forms = [...new Set(homes.filter((h) => h.length > 1).flatMap((h) => [h, h.replaceAll("\\", "\\\\"), h.replaceAll("\\", "/")]))]
    .sort((a, b) => b.length - a.length);
  return forms.reduce((t, h) => t.replace(new RegExp(h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), win ? "gi" : "g"), "~"), s);
}

// A new-issue link with the bug form filled in. The user reads and submits it on
// GitHub; nothing is sent from here. GitHub refuses URLs much past 8 KB, so the error
// text gives way first.
export function issueUrl(o: { title?: string; what?: string } = {}): string {
  let what = scrubHome(o.what ?? "");
  const title = scrubHome(o.title ?? "").slice(0, 120), env = systemInfo();
  // `what` and `env` fill the form's fields; `body` carries the same text for when GitHub
  // has no bug.yml (not pushed yet, a fork without it) and ignores the field params.
  const build = () => `${REPO_URL}/issues/new?` + new URLSearchParams({
    template: "bug.yml", title, what, env, body: `### What happened\n\n${what}\n\n### Environment\n\n\`\`\`text\n${env}\n\`\`\``,
  }).toString();
  let url = build();
  while (url.length > 7500 && what) { what = what.slice(0, Math.floor(what.length * 0.8)) + "\n…(cut)"; url = build(); if (what.length < 20) what = ""; }
  return url;
}
