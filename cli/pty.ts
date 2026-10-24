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

type Pty = { proc: Bun.Subprocess; out: string[]; size: number; listeners: Set<(d: string | null) => void>; exit: number | null; asking: boolean; quiet?: Timer; total: number; since: number; typed: number; onChange?: () => void };

// What a page attaching late gets replayed. A full-screen tool redraws often, so the
// tail of its output is enough to rebuild the screen.
const CAP = 512 * 1024;
// An ended agent's last screen stays readable this long, then the session is dropped.
const KEEP_MS = 10 * 60_000;

const ptys = new Map<string, Pty>();

// A question the agent stopped on: Claude Code's and Codex's approval and choice prompts.
// ponytail: screen-text heuristic, misses a prompt worded otherwise; read agent hooks if that bites.
const ASK = /Would you like to|Do you want to|[❯›>] ?1\. |Type something|\(y\/n\)|\[y\/N\]|Press enter to/i;
// Escape sequences out; a cursor move becomes a space so words drawn apart stay apart.
export const asking = (screen: string) =>
  ASK.test(screen.replace(/\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-Za-z]/g, " "));
// How long output stays still before the screen is read for a question.
const QUIET_MS = 700;
// Bun gained pseudo-terminals in 1.3.5; an older one spawns without a tty, so it
// keeps opening terminal windows.
export const ptySupported = WIN || typeof (Bun as any).Terminal === "function";

// Starts cmd in a new pseudo-terminal under `key` and returns its PID. pidFile gets
// that PID, the agent's own, so closeSessions can end it like any launched session.
// onChange: called when the agent ends or starts or stops asking, so the board can redraw.
export function startPty(key: string, cmd: string[], cwd: string, pidFile?: string, onChange?: () => void): number {
  const dec = new TextDecoder();
  const p: Pty = { proc: null as unknown as Bun.Subprocess, out: [], size: 0, listeners: new Set(), exit: null, asking: false, total: 0, since: 0, typed: 0, onChange };
  const flag = (v: boolean) => { if (p.asking !== v) { p.asking = v; onChange?.(); } };
  const push = (d: string) => {
    p.out.push(d);
    p.size += d.length;
    p.total += d.length;
    while (p.size > CAP && p.out.length > 1) p.size -= p.out.shift()!.length;
    for (const f of p.listeners) f(d);
    clearTimeout(p.quiet);
    p.quiet = setTimeout(() => {
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
  ptys.set(key, p);
  if (pidFile) writeFileSync(pidFile, String(p.proc.pid));
  p.proc.exited.then((code) => {
    p.exit = code;
    clearTimeout(p.quiet);
    p.asking = false;
    for (const f of p.listeners) f(null);
    p.listeners.clear();
    try { p.proc.terminal?.close(); } catch { /* already closed */ }
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
    p.typed = Date.now();
    p.since = p.total;
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
  setTimeout(() => { if (p.exit === null) p.proc.kill(); }, grace).unref();
  return true;
}

export function resizePty(key: string, cols: number, rows: number) {
  const p = ptys.get(key);
  const c = Math.max(10, Math.min(500, cols | 0)), r = Math.max(5, Math.min(300, rows | 0));
  if (p && p.exit === null) WIN ? send(p, resizeSeq(c, r)) : p.proc.terminal?.resize(c, r);
}

export const ptyKeys = () => [...ptys.keys()];

export const ptyState = (key: string) => {
  const p = ptys.get(key);
  return p ? { alive: p.exit === null, exit: p.exit, asking: p.asking, typed: p.typed } : null;
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
