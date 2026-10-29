// Agents the web board runs itself, each in a pseudo-terminal the board owns, so a
// card can show the agent's screen and pass it the user's typing (agent.launch: card).
// They live in this process: the board stopping ends them, as closing a terminal
// window ends the agent in it. Bun has no pseudo-terminal on Windows; there the
// agent runs under a ConPTY host (conpty.ts) spoken to over pipes.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { conptyHost, innerCommand, resizeSeq } from "./conpty.ts";

const WIN = process.platform === "win32";
// Windows PowerShell, which every Windows has, both hosts the console and runs the agent in it.
const winPs = () => join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");

type Pty = { proc: Bun.Subprocess; out: string[]; size: number; listeners: Set<(d: string | null) => void>; exit: number | null; asking: boolean; busy: boolean; quiet?: Timer; total: number; since: number; onChange?: () => void; tmux?: string; last: string; lastAt: number; typedAt: number; born: number };

// What a page attaching late gets replayed. A full-screen tool redraws often, so the
// tail of its output is enough to rebuild the screen.
const CAP = 512 * 1024;
// An ended agent's last screen stays readable this long, then the session is dropped.
const KEEP_MS = 10 * 60_000;

const ptys = new Map<string, Pty>();

// What the sidebar shows for an agent: the latest line the agent printed. Keystrokes are never kept,
// and nothing is read while a question is open or within ECHO_MS of a keystroke: a terminal echoes
// what is typed, so that line could be a password. Memory only.
const ECHO_MS = 1500;
const grab = (p: Pty, text: string, every: number) => {
  const now = Date.now();
  if (p.asking || now - p.typedAt < ECHO_MS || now - p.lastAt < every) return;
  const l = lastLine(text);
  if (l) { p.last = l; p.lastAt = now; }
};

// A question the agent stopped on: Claude Code's and Codex's approval and choice prompts.
// ponytail: screen-text heuristic, misses a prompt worded otherwise; read agent hooks if that bites.
const ASK = /Would you like to|Do you want to|[❯›>] ?1\. |Type something|\(y\/n\)|\[y\/N\]|Press enter to/i;
// Escape sequences out; a cursor move becomes a space so words drawn apart stay apart.
// The agent's working line (Claude Code's "✻ Thinking… (12s · ↓ 1.2k tokens)", Codex's
// "Working (12s • esc to interrupt)", Gemini's "(esc to cancel, 12s)", opencode's "esc interrupt")
// drawn after the last question means the question was answered and it is working again: a
// redraw of the answered prompt or prompt-like words in its output would otherwise keep it "asking".
// Not a bare "Esc to cancel": Claude Code's own question footer says that.
const WORK = /\(\d+m? ?\d*s [·•]|esc to interrupt|\(esc to cancel, \d|esc interrupt/gi;
const WORKING = new RegExp(WORK.source, "i");
const lastAt = (re: RegExp, t: string) => { let i = -1; for (const m of t.matchAll(re)) i = m.index!; return i; };
export const asking = (screen: string) => {
  const t = screen.replace(/\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-Za-z]/g, " ");
  const q = lastAt(new RegExp(ASK.source, "gi"), t);
  return q >= 0 && q > lastAt(WORK, t);
};
// How long output stays still before the screen is read for a question.
export const QUIET_MS = 700;
// The latest meaningful line of some terminal output, for the sidebar card: escape sequences, box
// drawing, spinners and the TUI's own footer lines out. "" when nothing readable is left.
// ponytail: screen-text heuristic over raw chunks; a TUI that repaints oddly shows an older line.
const CHROME = new RegExp(WORK.source + "|\\? for shortcuts|shift\\+tab|ctrl\\+[a-z]|\\besc to\\b|tokens\\)|bypass permissions", "i");
// Only the agent's own reply lines, never a guess about what is input: a line counts only when it
// starts with a reply marker the agent draws itself (Claude Code "⏺", Codex "•", Gemini "✦").
// Typed or pasted text never starts with one, so nothing typed can be shown; a plain shell or an
// unknown agent gives "" and its card shows status only. Lines inside an input box (╰ … ╭, read
// bottom-up) or between two horizontal rules are skipped as well; a tool call shows its name only.
// ponytail: the marker list is per agent; an agent that changes its marker shows status only.
const REPLY = /^[⏺•✦]\s+(.*)$/;
export const lastLine = (t: string) => {
  const s = t.replace(/\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-Za-z]/g, " ");
  let box = false,
    rule = false;
  for (const line of s.split(/[\r\n]+/).reverse()) {
    const raw = line.replace(/[\x00-\x1f\x7f]/g, " ").trim();
    if (box) { if (raw.startsWith("╭")) box = false; continue; }
    if (raw.startsWith("╰") && !/[\p{L}\p{N}]/u.test(raw)) { box = true; continue; }
    // An input area drawn between two horizontal rules (newer Claude Code, no box): skip up to the rule above.
    if (/^─{3,}$/.test(raw.replace(/\s/g, ""))) { rule = !rule; continue; }
    if (rule) continue;
    const m = REPLY.exec(raw);
    if (!m) continue;
    // A tool call shows only its name: "Bash(curl … Bearer sk-…)" -> "Bash", never its arguments.
    const l = m[1].replace(/^([\w .-]{1,40})\(.*$/, "$1").replace(/[\u2500-\u259f\u2800-\u28ff✻✶✳✢✽✺●○◐◑◒◓⏺⎿⏵▪▫■□]/g, " ").replace(/\s+/g, " ").trim();
    if (/[\p{L}\p{N}].*[\p{L}\p{N}].*[\p{L}\p{N}]/u.test(l) && !CHROME.test(l)) return l.slice(0, 80);
  }
  return "";
};
// Bun gained pseudo-terminals in 1.3.5; an older one spawns without a tty, so it
// keeps opening terminal windows.
export const ptySupported = WIN || typeof (Bun as any).Terminal === "function";

// Starts cmd in a new pseudo-terminal under `key` and returns its PID. pidFile gets
// that PID, the agent's own, so closeSessions can end it like any launched session.
// onChange: called when the agent ends or starts or stops asking, so the board can redraw.
// seed: what the card showed before the board restarted, replayed ahead of the new output.
// tmux: run cmd inside a tmux session of that name on kaizen's own server (tmuxCmd), which
// outlives the board; null where tmux cannot be used, and the agent runs plainly.
export function startPty(key: string, cmd: string[], cwd: string, pidFile?: string, onChange?: () => void, opts: { seed?: string; tmux?: string; attach?: boolean } = {}): number {
  const dec = new TextDecoder();
  const p: Pty = { proc: null as unknown as Bun.Subprocess, out: opts.seed ? [opts.seed] : [], size: opts.seed?.length ?? 0, listeners: new Set(), exit: null, asking: false, busy: false, total: 0, since: 0, onChange, last: "", lastAt: 0, typedAt: 0, born: Date.now() };
  // attach: the session already runs (kept from a board before this one); only a client is started.
  if (opts.tmux && tmuxOk()) cmd = opts.attach ? attachCmd(opts.tmux) : tmuxCmd(opts.tmux, cmd);
  const flag = (v: boolean) => { if (p.asking !== v) { p.asking = v; onChange?.(); } };
  // busy: the agent's working line (WORK) drawn in the last QUIET_MS. A working agent redraws it many
  // times a second; other output (a status-line refresh, a repaint on resize or focus) is not work.
  const work = (v: boolean) => { if (p.busy !== v) { p.busy = v; onChange?.(); } };
  const push = (d: string) => {
    p.out.push(d);
    p.size += d.length;
    p.total += d.length;
    while (p.size > CAP && p.out.length > 1) p.size -= p.out.shift()!.length;
    for (const f of p.listeners) f(d);
    if (WORKING.test(d)) work(p.exit === null);
    grab(p, d, 1000);
    clearTimeout(p.quiet);
    p.quiet = setTimeout(() => {
      work(false);
      const tail = p.out.slice(-8).join("").slice(-4096);
      grab(p, tail, 0);
      // Only what came after the user's last keystroke: a question already answered may still be in the tail.
      const n = Math.min(4096, p.total - p.since);
      flag(p.exit === null && n > 0 && asking(p.out.join("").slice(-n)));
    }, QUIET_MS);
  };
  if (WIN) {
    const ps = winPs();
    p.proc = Bun.spawn([ps, "-NoProfile", "-NonInteractive", "-EncodedCommand", conptyHost()], {
      cwd,
      env: { ...process.env, KZ_PTY_CMD: innerCommand(ps, cmd), KZ_PTY_CWD: cwd, KZ_PTY_COLS: "120", KZ_PTY_ROWS: "32" },
      stdin: "pipe", stdout: "pipe", stderr: "pipe", windowsHide: true,
    });
    const read = async (s: ReadableStream<Uint8Array>) => {
      const d = new TextDecoder();
      for await (const c of s) push(d.decode(c, { stream: true }));
    };
    read(p.proc.stdout as ReadableStream<Uint8Array>).catch(() => {});
    // The host's own failures (Add-Type, CreateProcess) land on the screen, not nowhere.
    read(p.proc.stderr as ReadableStream<Uint8Array>).catch(() => {});
  } else p.proc = Bun.spawn(cmd, {
    cwd,
    env: { ...process.env, TERM: "xterm-256color", COLORTERM: "truecolor" },
    terminal: { cols: 120, rows: 32, data: (_t, d) => push(dec.decode(d, { stream: true })) },
  });
  if (opts.tmux && cmd[0] === tmuxBin()) p.tmux = opts.tmux;
  ptys.set(key, p);
  if (pidFile) writeFileSync(pidFile, String(p.proc.pid));
  // A tmux-kept agent's PID is the pane's, not the client's: the client is gone after a
  // board restart, and its arguments never name the agent, so closeSessions would not
  // know an attached client for the run's agent and could not end it.
  if (pidFile && p.tmux) {
    const name = p.tmux;
    (async () => {
      for (let i = 0; i < 40 && p.exit === null; i++) {
        const pane = panePid(name);
        if (pane) { try { writeFileSync(pidFile, String(pane)); } catch { /* record gone */ } return; }
        await Bun.sleep(50);
      }
    })();
  }
  p.proc.exited.then((code) => {
    p.exit = code;
    clearTimeout(p.quiet);
    p.asking = false;
    p.busy = false;
    for (const f of p.listeners) f(null);
    p.listeners.clear();
    try { p.proc.terminal?.close(); } catch { /* already closed */ }
    // What the agent started and left behind (a test run, a dev server) goes with it. The
    // pty made it a session and group leader, so its group id is its PID; a tmux client's
    // group holds only the client, never the tmux server the agent runs under.
    if (!WIN) { try { process.kill(-p.proc.pid, "SIGTERM"); } catch { /* group already empty */ } }
    // Dropped: pages showing it (the Terminal page) refresh, or its tile lingers until some other change.
    setTimeout(() => { if (ptys.get(key) === p) { ptys.delete(key); onChange?.(); } }, KEEP_MS).unref();
    onChange?.();
  });
  return p.proc.pid;
}

// Replays what the session has printed so far, then streams; null means it ended.
// Returns the detach function, or null for an unknown session.
export function attachPty(key: string, fn: (d: string | null) => void): (() => void) | null {
  const p = ptys.get(key);
  if (!p) return null;
  if (p.out.length) fn(p.out.join(""));
  if (p.exit !== null) { fn(null); return () => {}; }
  p.listeners.add(fn);
  return () => p.listeners.delete(fn);
}

// What the page's terminal sends by itself: focus in/out (Claude Code turns focus
// reporting on), mouse and wheel reports, and answers to the agent's queries (cursor,
// device, mode, colour, version). None of it is the user typing.
const REPORT = /\x1b\[[IO]|\x1b\[<[\d;]*[Mm]|\x1b\[\?[\d;]*(?:[cnu]|\$y)|\x1b\[>[\d;]*c|\x1b\[\d+;\d+R|\x1b\[\d*n|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1bP[^\x1b]*\x1b\\/g;

export function writePty(key: string, d: string) {
  const p = ptys.get(key);
  if (!p || p.exit !== null) return;
  if (d.replace(REPORT, "")) {
    p.since = p.total;
    p.typedAt = Date.now();
    if (p.asking) { p.asking = false; p.onChange?.(); }
  }
  send(p, d);
}

const send = (p: Pty, d: string) => {
  if (!WIN) return p.proc.terminal?.write(d);
  try { (p.proc.stdin as Bun.FileSink).write(d); (p.proc.stdin as Bun.FileSink).flush(); } catch { /* host gone */ }
};

// The tile's ×: ask the agent to quit as the user would (/exit), then end it if it is
// still there after `grace`. Escape first clears whatever is half-typed at its prompt.
export function exitPty(key: string, grace = 5000): boolean {
  const p = ptys.get(key);
  if (!p || p.exit !== null) return false;
  send(p, "\x1b");
  setTimeout(() => send(p, "/exit\r"), 100);
  setTimeout(() => {
    if (p.exit === null) { if (WIN) p.proc.kill(); else { try { process.kill(-p.proc.pid, "SIGKILL"); } catch { p.proc.kill(); } } }
    if (p.tmux) killTmux(p.tmux);
  }, grace).unref();
  return true;
}

// The board stopping with a tmux-kept agent: only its client ends, the agent keeps running
// in kaizen's tmux server, and the next board attaches to it (attachCmd).
export function detachPty(key: string): boolean {
  const p = ptys.get(key);
  if (!p || p.exit !== null || !p.tmux) return false;
  p.proc.kill();
  return true;
}

// The last n characters the session printed, from a line start, for the next board to show.
export function ptyTail(key: string, n = 64 * 1024): string | null {
  const p = ptys.get(key);
  if (!p || !p.out.length) return null;
  const t = p.out.join("").slice(-n);
  return t.length < n ? t : t.slice(t.indexOf("\n") + 1);
}
export const ptyTmux = (key: string) => ptys.get(key)?.tmux ?? null;

// The line a resumed card shows below what the agent printed before the board restarted.
export const RESUMED = "\r\n\x1b[0m\x1b[2m— board restarted · agent resumed · the step it was on was cut off —\x1b[0m\r\n";

// tmux keep-alive (agent.keep_alive: tmux). A server of kaizen's own (-L kaizen) with no
// user config (-f /dev/null), so the user's sessions and key bindings are never touched:
// no status bar, no prefix key, Escape passed at once. Not on Windows, which has no tmux.
const TMUX = ["-L", "kaizen", "-f", "/dev/null"];
const tmuxBin = () => (WIN ? null : Bun.which("tmux"));
export const tmuxOk = () => !!tmuxBin();
export const tmuxName = (key: string) => `kz-${key.replace(/[^\w-]/g, "_")}`;
// PATH from this board, not the tmux server's own: the server keeps the environment of
// whichever board started it.
export const tmuxCmd = (name: string, cmd: string[]) => [tmuxBin()!, ...TMUX, "new-session", "-A", "-s", name, "-x", "120", "-y", "32", "-e", `PATH=${process.env.PATH ?? ""}`, ...cmd,
  ";", "set", "-g", "status", "off", ";", "set", "-g", "prefix", "None", ";", "set", "-g", "escape-time", "0",
  ";", "set", "-as", "terminal-features", ",xterm-256color:RGB"];
export const attachCmd = (name: string) => [tmuxBin()!, ...TMUX, "attach-session", "-t", name];
const tmux = (...a: string[]) => {
  const bin = tmuxBin();
  try { return !!bin && Bun.spawnSync([bin, ...TMUX, ...a], { stdin: "ignore", stdout: "ignore", stderr: "ignore", timeout: 3000 }).exitCode === 0; } catch { return false; }
};
export const tmuxAlive = (name: string) => tmux("has-session", "-t", `=${name}`);
export const panePid = (name: string): number | null => {
  const bin = tmuxBin();
  try { return bin ? Number(Bun.spawnSync([bin, ...TMUX, "display-message", "-p", "-t", `=${name}:`, "#{pane_pid}"], { stdin: "ignore", stderr: "ignore", timeout: 3000 }).stdout.toString().trim()) || null : null; } catch { return null; }
};
export const killTmux = (name: string) => tmux("kill-session", "-t", `=${name}`);

export function resizePty(key: string, cols: number, rows: number) {
  const p = ptys.get(key);
  const c = Math.max(10, Math.min(500, cols | 0)), r = Math.max(5, Math.min(300, rows | 0));
  if (p && p.exit === null) WIN ? send(p, resizeSeq(c, r)) : p.proc.terminal?.resize(c, r);
}

export const ptyKeys = () => [...ptys.keys()];

export const ptyState = (key: string) => {
  const p = ptys.get(key);
  return p ? { alive: p.exit === null, exit: p.exit, asking: p.asking, busy: p.busy, total: p.total, last: p.last, at: p.lastAt, born: p.born } : null;
};

// The environment the user's login shell builds: PATH and anything exported in their
// profile. A board started from a launcher (Spotlight, an app menu) gets the desktop's
// bare environment instead, and an agent it starts directly would not find claude,
// node or an API key a terminal window always had. Interactive too, since zsh and
// bash read .zshrc/.bashrc only then; whatever the profile prints before the marker
// is skipped. env is a program, so any shell (fish, nu) runs the same line. null when
// the shell fails or takes over 5 seconds: the board keeps its own environment.
export function loginEnv(shell = process.env.SHELL): Record<string, string> | null {
  if (!shell || process.platform === "win32") return null;
  const MARK = "__kaizen_env__";
  try {
    const r = Bun.spawnSync([shell, "-l", "-i", "-c", `echo ${MARK}; env -0`], { stdin: "ignore", stderr: "ignore", timeout: 5000, killSignal: "SIGKILL" });
    const out = r.stdout.toString(), at = out.indexOf(MARK + "\n");
    if (r.exitCode !== 0 || at < 0) return null;
    const env: Record<string, string> = {};
    for (const kv of out.slice(at + MARK.length + 1).split("\0")) {
      const eq = kv.indexOf("=");
      if (eq > 0) env[kv.slice(0, eq)] = kv.slice(eq + 1);
    }
    return env.PATH ? env : null;
  } catch { return null; }
}

// Into this process: keys the board lacks are added, and the login shell's PATH
// entries are appended after the board's own. What the board was started with wins
// everywhere, so a variable or PATH set on the command line is never overridden.
// SIGKILL above: a shell stopped by job control ignores the timeout's SIGTERM.
export function adoptLoginEnv(env = loginEnv()) {
  if (!env) return;
  // The shell's own bookkeeping describes that shell, not this process.
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined && !["PWD", "OLDPWD", "SHLVL", "_"].includes(k)) process.env[k] = v;
  process.env.PATH = [...new Set([...(process.env.PATH ?? "").split(":"), ...env.PATH!.split(":")])].filter(Boolean).join(":");
}
