// Start, watch and stop the kaizen board for the desktop app. Plain Node APIs only,
// so the same file runs in Electron's main process and under `bun test`.
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

/** The port `kaizen web` uses, and the one `tailscale serve` for the phone points at. */
export const BOARD_PORT = 7420;

/** BOARD_PORT when nothing holds it (so the phone and bookmarks keep working), else
 *  any free port the OS hands out. */
export async function boardPort(preferred = BOARD_PORT): Promise<number> {
  return freePort(preferred).catch(() => freePort());
}

/** Ask the OS for a port nothing listens on: `want`, or any when 0. */
export function freePort(want = 0): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(want, "127.0.0.1", () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

/** Version from a kaizen folder's package.json, or "" when it is not one. */
export function versionOf(dir: string): string {
  try { return JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version ?? ""; }
  catch { return ""; }
}

/** a > b for dotted numeric versions; anything unreadable counts as 0. */
export function newer(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n) || 0), pb = b.split(".").map((n) => parseInt(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  }
  return false;
}

/** The bundled copy, unless an installed kaizen is newer (approved decision 4). */
export function pickKaizen(bundled: string, installed: string): { dir: string; bundled: boolean } {
  const usable = existsSync(join(installed, "cli", "install.ts"));
  if (usable && newer(versionOf(installed), versionOf(bundled))) return { dir: installed, bundled: false };
  return { dir: bundled, bundled: true };
}

export type Board = { child: ChildProcess; port: number; url: string; log: string[] };

/** Spawn `<bun> <dir>/cli/install.ts web --port N --no-open --foreground`. */
export function startBoard(o: { bun: string; dir: string; port: number; bundled: boolean; cwd: string; env?: NodeJS.ProcessEnv }): Board {
  const env = { ...process.env, ...o.env };
  // A bundled copy has no .git, so the CLI would look for ~/kaizen; point it here.
  // It is also read-only and updates with the app, so the board hides its Update.
  if (o.bundled) { env.KAIZEN_HOME = o.dir; env.KAIZEN_DESKTOP_BUNDLED = "1"; } else delete env.KAIZEN_DESKTOP_BUNDLED;
  // The board is Bun; Electron's own variables must not leak into it.
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(o.bun, [join(o.dir, "cli", "install.ts"), "web", "--port", String(o.port), "--no-open", "--foreground"], {
    cwd: o.cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    // Its own process group on Unix, so stopping it reaches what it started.
    detached: process.platform !== "win32",
    windowsHide: true,
  });
  const log: string[] = [];
  const keep = (b: Buffer) => { log.push(b.toString()); if (log.length > 200) log.shift(); };
  child.stdout?.on("data", keep);
  child.stderr?.on("data", keep);
  return { child, port: o.port, url: `http://127.0.0.1:${o.port}/`, log };
}

/** Resolve once the board answers; reject when it exits first or time runs out. */
export async function waitReady(b: Pick<Board, "child" | "url">, timeoutMs = 30000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (b.child.exitCode !== null || b.child.signalCode !== null) throw new Error(`board exited (${b.child.exitCode ?? b.child.signalCode}) before it was ready`);
    try {
      const r = await fetch(b.url, { signal: AbortSignal.timeout(1000) });
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`board did not answer on ${b.url} within ${Math.round(timeoutMs / 1000)}s`);
}

/** End a process and what it started: its group on Unix, its tree on Windows. */
export function killTree(pid: number, signal: NodeJS.Signals = "SIGTERM") {
  if (process.platform === "win32") { spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }); return; }
  try { process.kill(-pid, signal); } catch { try { process.kill(pid, signal); } catch { /* gone */ } }
}

/** Stop the board and everything it started. Resolves when the process is gone. */
export function stopBoard(child: ChildProcess, graceMs = 4000): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return Promise.resolve();
  const pid = child.pid;
  return new Promise((resolve) => {
    child.once("exit", () => resolve());
    // SIGTERM lets the board save its live terminals (it exits within 3s on its own).
    killTree(pid);
    if (process.platform !== "win32") setTimeout(() => killTree(pid, "SIGKILL"), graceMs).unref();
  });
}

// The board runs in its own process group, so it outlives an app that is killed
// hard. The app records it here and the next launch ends a board left behind.
export function rememberBoard(file: string, b: Board) {
  try { writeFileSync(file, JSON.stringify({ pid: b.child.pid, port: b.port })); } catch { /* best effort */ }
}
export function forgetBoard(file: string) { rmSync(file, { force: true }); }

/** End a board a crashed earlier launch left running. Only when that pid is still
 *  alive AND its port still answers, so a reused pid is never killed. */
export async function reapStale(file: string): Promise<boolean> {
  let rec: { pid?: number; port?: number };
  try { rec = JSON.parse(readFileSync(file, "utf8")); } catch { return false; }
  forgetBoard(file);
  if (!rec.pid || !rec.port) return false;
  try { process.kill(rec.pid, 0); } catch { return false; }
  try { await fetch(`http://127.0.0.1:${rec.port}/`, { signal: AbortSignal.timeout(1000) }); } catch { return false; }
  killTree(rec.pid);
  return true;
}
