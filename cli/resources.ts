// What the footer's resource monitor reports: memory for the machine, for kaizen and per
// terminal, and the disk kaizen takes. Apart from cli/web.ts so the parsing and the walk
// can be tested without a board. Read only: nothing here kills or deletes.
import { freemem, totalmem } from "node:os";
import { readFileSync, realpathSync } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

export function systemMemory(meminfo?: string) {
  const total = totalmem();
  let free = freemem();
  // freemem() on Linux leaves out the page cache, which would read as a nearly full machine.
  try {
    const text = meminfo ?? readFileSync("/proc/meminfo", "utf8");
    const kb = /^MemAvailable:\s+(\d+) kB/m.exec(text);
    if (kb) free = Number(kb[1]) * 1024;
  } catch { /* not Linux */ }
  return { total, used: Math.max(0, total - free) };
}

export type Proc = { pid: number; ppid: number; rss: number };

export function parsePs(out: string): Proc[] {
  return out.split("\n").flatMap((l) => {
    const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s*$/.exec(l);
    return m ? [{ pid: Number(m[1]), ppid: Number(m[2]), rss: Number(m[3]) * 1024 }] : [];
  });
}

// Every process with its parent and memory; null where there is no ps (Windows), so a
// caller shows "not known" rather than zero.
export async function processTable(): Promise<Proc[] | null> {
  if (process.platform === "win32") return null;
  try {
    const p = Bun.spawn(["ps", "-axo", "pid=,ppid=,rss="], { stdout: "pipe", stderr: "ignore", windowsHide: true });
    const out = await new Response(p.stdout).text();
    return (await p.exited) === 0 ? parsePs(out) : null;
  } catch { return null; }
}

// Memory of these processes and all their descendants, each counted once however many
// roots reach it. Resident sizes add shared pages more than once, so it runs a little high.
export function treeRss(table: Proc[], roots: number[]): number {
  const kids = new Map<number, Proc[]>(), byPid = new Map(table.map((p) => [p.pid, p]));
  for (const p of table) (kids.get(p.ppid) ?? kids.set(p.ppid, []).get(p.ppid)!).push(p);
  const seen = new Set<number>(), todo = [...roots];
  let sum = 0;
  while (todo.length) {
    const pid = todo.pop()!;
    if (seen.has(pid)) continue;
    seen.add(pid);
    sum += byPid.get(pid)?.rss ?? 0;
    for (const k of kids.get(pid) ?? []) todo.push(k.pid);
  }
  return sum;
}

const real = (p: string) => { try { return realpathSync(p); } catch { return null; } };

// Bytes on disk under a folder. lstat, so a symlink counts as itself and is never followed;
// a folder in `skip` (real paths) belongs to another row. Every await hands the one thread
// back, so a large tree slows the scan and not the board.
export async function folderSize(path: string, skip: Set<string> = new Set()): Promise<number> {
  let sum = 0;
  const todo = [path];
  while (todo.length) {
    const dir = todo.pop()!;
    if (skip.has(dir)) continue;
    let names: string[];
    try { names = await readdir(dir); } catch { continue; }
    for (let i = 0; i < names.length; i += 64) {
      const stats = await Promise.all(names.slice(i, i + 64).map(async (n) => {
        try { const s = await lstat(join(dir, n)); return { p: join(dir, n), s }; } catch { return null; }
      }));
      for (const e of stats) {
        if (!e) continue;
        sum += e.s.blocks ? e.s.blocks * 512 : e.s.size;
        if (e.s.isDirectory()) todo.push(e.p);
      }
    }
  }
  return sum;
}

export type Root = { name: string; dir: string; path: string; kind: "home" | "install" | "project" };
export type StorageRow = Omit<Root, "path"> & { bytes: number };

// One row per real folder, and no folder counted inside another row: a checkout that is
// both the install and a registered project gives its .kaizen to the project row.
export async function measure(roots: Root[]): Promise<{ total: number; rows: StorageRow[] }> {
  const seen = new Map<string, Root>();
  for (const r of roots) { const p = real(r.path); if (p && !seen.has(p)) seen.set(p, r); }
  const rows: StorageRow[] = [];
  for (const [p, r] of seen) {
    const skip = new Set([...seen.keys()].filter((o) => o !== p));
    rows.push({ name: r.name, dir: r.dir, kind: r.kind, bytes: await folderSize(p, skip) });
  }
  rows.sort((a, b) => b.bytes - a.bytes);
  return { total: rows.reduce((n, r) => n + r.bytes, 0), rows };
}

const FRESH = 5 * 60_000;
let result: { total: number; rows: StorageRow[]; at: number } | null = null;
let scanning = false;

// Never waits: starts a scan when the last is old (or on refresh) and answers with what it has.
export function storage(roots: () => Root[], refresh = false) {
  if (!scanning && (refresh || !result || Date.now() - result.at > FRESH)) {
    scanning = true;
    void measure(roots()).then((r) => { result = { ...r, at: Date.now() }; }).catch(() => {}).finally(() => { scanning = false; });
  }
  return { ...(result ?? { total: 0, rows: [], at: 0 }), scanning };
}
