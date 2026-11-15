// A dev server that cannot start because its port is taken: which port its terminal says is in use, who holds it, and
// stopping that process (the Run app button offers it). Linux reads `ss` and /proc; macOS reads `lsof`; Windows is not covered.
import { readlinkSync, readFileSync } from "node:fs";

// "EADDRINUSE ... :7431", "address already in use 0.0.0.0:3000", "Port 5173 is already in use", "port 8080 is already allocated".
export function conflictPort(text: string): number | null {
  const t = text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
  const m =
    /EADDRINUSE[^\n]*:(\d{2,5})(?!\d)/i.exec(t) ??
    /address already in use[^\n]*:(\d{2,5})(?!\d)/i.exec(t) ??
    /port\s+(\d{2,5})\s+(?:is\s+)?(?:already\s+)?(?:in use|allocated|taken)/i.exec(t) ??
    /(?:listen|bind)[^\n]*?:(\d{2,5})[^\n]*in use/i.exec(t);
  const n = m ? Number(m[1]) : NaN;
  return n >= 1 && n <= 65535 ? n : null;
}

export type Holder = { pid: number; name: string; cmd: string; cwd: string };

// The processes listening on a loopback or wildcard port, from `ss -ltnpH`.
export function holdersFromSs(ss: string, port: number): { pid: number; name: string }[] {
  const out: { pid: number; name: string }[] = [];
  for (const line of ss.split("\n")) {
    if (!new RegExp(`[:\\]]${port}\\s`).test(line)) continue;
    const name = /users:\(\("([^"]+)"/.exec(line)?.[1] ?? "";
    for (const [, pid] of line.matchAll(/pid=(\d+)/g)) out.push({ pid: Number(pid), name });
  }
  return out;
}

const run = async (cmd: string[]) => {
  try {
    const p = Bun.spawn(cmd, { stdout: "pipe", stderr: "ignore", timeout: 3000 });
    return await new Response(p.stdout).text();
  } catch {
    return "";
  }
};

export async function holders(port: number): Promise<Holder[]> {
  if (process.platform === "linux") {
    return holdersFromSs(await run(["ss", "-ltnpH"]), port).map(({ pid, name }) => {
      let cmd = "", cwd = "";
      try { cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").join(" ").trim(); } catch {}
      try { cwd = readlinkSync(`/proc/${pid}/cwd`); } catch {}
      return { pid, name, cmd: cmd || name, cwd };
    });
  }
  if (process.platform === "darwin") {
    const out = await run(["lsof", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-Fpc"]);
    const found: Holder[] = [];
    let cur: Holder | null = null;
    for (const l of out.split("\n")) {
      if (l[0] === "p") found.push((cur = { pid: Number(l.slice(1)), name: "", cmd: "", cwd: "" }));
      else if (l[0] === "c" && cur) cur.name = cur.cmd = l.slice(1);
    }
    return found;
  }
  return [];
}

// Stops what listens on `port`: only a process of this user, never the board's own. TERM first, KILL if it is still there.
export async function stopPort(port: number, spare: number[] = []): Promise<{ ok: boolean; error?: string; stopped?: Holder[] }> {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return { ok: false, error: "that port is not one to stop" };
  const mine = typeof process.getuid === "function" ? process.getuid() : null;
  const found = await holders(port);
  if (!found.length) return { ok: false, error: "nothing is listening on that port" };
  const stopped: Holder[] = [];
  for (const h of found) {
    if (h.pid === process.pid || spare.includes(h.pid)) return { ok: false, error: "that is the board itself" };
    if (mine !== null) {
      try {
        const uid = Number(/^Uid:\s+(\d+)/m.exec(readFileSync(`/proc/${h.pid}/status`, "utf8"))?.[1]);
        if (Number.isFinite(uid) && uid !== mine) return { ok: false, error: "that process belongs to another user" };
      } catch {}
    }
    try { process.kill(h.pid, "SIGTERM"); stopped.push(h); } catch (e) { return { ok: false, error: String((e as Error).message ?? e) }; }
  }
  for (let i = 0; i < 10 && (await holders(port)).length; i++) await new Promise((r) => setTimeout(r, 200));
  for (const h of await holders(port)) { try { process.kill(h.pid, "SIGKILL"); } catch {} }
  return { ok: true, stopped };
}

// The TCP ports this user's processes listen on, with where each runs (Linux: `ss` and /proc). `where` is the project folder
// the process works in, so the board lists the apps of its own projects and not every service on the computer.
export type Listener = { port: number; pid: number; name: string; cmd: string; cwd: string };
export function parseListeners(ss: string, info: (pid: number) => { cmd: string; cwd: string; mine: boolean }): Listener[] {
  const seen = new Set<string>(), out: Listener[] = [];
  for (const line of ss.split("\n")) {
    const port = Number(/[:\]](\d+)\s+\S+:\*|[:\]](\d+)\s+\S+\s*$/.exec(line)?.[1] ?? /:(\d+)\s/.exec(line)?.[1]);
    if (!port) continue;
    const name = /users:\(\("([^"]+)"/.exec(line)?.[1] ?? "";
    for (const [, p] of line.matchAll(/pid=(\d+)/g)) {
      const pid = Number(p), k = `${port}:${pid}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const i = info(pid);
      if (i.mine) out.push({ port, pid, name, cmd: i.cmd || name, cwd: i.cwd });
    }
  }
  return out.sort((a, b) => a.port - b.port);
}
// The listeners whose working folder is inside one of `dirs`; each with the folder it matched.
export const inProjects = (list: Listener[], dirs: string[]) =>
  list.flatMap((l) => {
    const d = dirs.filter((x) => l.cwd === x || l.cwd.startsWith(x + "/")).sort((a, b) => b.length - a.length)[0];
    return d ? [{ ...l, project: d }] : [];
  });
export async function listeners(): Promise<Listener[]> {
  if (process.platform !== "linux") return [];
  const mine = typeof process.getuid === "function" ? process.getuid() : null;
  return parseListeners(await run(["ss", "-ltnpH"]), (pid) => {
    let cmd = "", cwd = "", uid = mine;
    try { cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").join(" ").trim(); } catch {}
    try { cwd = readlinkSync(`/proc/${pid}/cwd`); } catch {}
    try { uid = Number(/^Uid:\s+(\d+)/m.exec(readFileSync(`/proc/${pid}/status`, "utf8"))?.[1]); } catch {}
    return { cmd, cwd, mine: mine === null || uid === mine };
  });
}
