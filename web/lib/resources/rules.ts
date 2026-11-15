// The footer resource popup's numbers without the DOM (tested in resources-rules.test.ts): sizes, the bar's parts and the
// rings and sparkline paths.
export type Terminal = {
  key: string;
  title: string;
  agent?: string;
  project?: string;
  ws: string;
  dir?: string;
  rss?: number | null;
};
// A port a process of one of the board's projects listens on (GET /ports).
export type Port = { port: number; pid: number; name: string; cmd: string; cwd: string; project: string };
export type Resources = { system: { used: number; total: number }; kaizen: number; terminals: Terminal[] };
export type Disk = { at?: number; total: number; rows: { name: string; bytes: number }[]; scanning?: boolean };

export const size = (n: number) => {
  if (n < 1024 ** 2) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
};
export const usedPct = (r: Resources) => Math.round((r.system.used / r.system.total) * 100);
// The ring's circumference (r 15) and the part of it a percentage fills.
export const RING = 94.25;
export const ringDash = (pct: number) => ((pct / 100) * RING).toFixed(1);
// Memory in three parts: Kaizen and its terminals, the other apps, what is free.
export const memParts = (r: Resources): [string, number][] => [
  ["Kaizen and its terminals", r.kaizen],
  ["Other apps", Math.max(0, r.system.used - r.kaizen)],
  ["Free", Math.max(0, r.system.total - r.system.used)],
];
// The largest rows, the rest folded into one, so the bar stays readable.
export const topParts = (rows: { name: string; bytes: number }[]): [string, number][] => {
  const head = rows.slice(0, 4).map((r) => [r.name, r.bytes] as [string, number]),
    left = rows.slice(4).reduce((n, r) => n + r.bytes, 0);
  return left ? [...head, ["Other", left]] : head;
};
export const shareOf = (parts: [string, number][], v: number) =>
  Math.round((v / (parts.reduce((n, p) => n + p[1], 0) || 1)) * 100);
// Heaviest terminal first.
export const heaviest = (ts: Terminal[]) => [...ts].sort((a, b) => (b.rss ?? 0) - (a.rss ?? 0));
// The last minutes of memory use as an area and a line in a 100 x 36 box; null until there are two points.
export function sparkPoints(history: number[]): { line: string; area: string } | null {
  if (history.length < 2) return null;
  const x = (i: number) => (i / (history.length - 1)) * 100,
    y = (v: number) => 36 - v * 0.34;
  const line = history.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return { line, area: `0,36 ${line} 100,36` };
}
// Folder name of a terminal's workspace for its second line.
export const wsName = (t: Terminal) => `${t.project || "Home"} / ${t.ws.split(/[\\/]/).pop() || "main"}`;
// A process's command for a row: the program by its name, then the rest, cut to fit ("/usr/bin/node /app/vite.js --port 5173" -> "node /app/vite.js --port 5173").
export const shortCmd = (cmd: string, max = 56) => {
  const t = cmd.trim().replace(/\s+/g, " ").replace(/^(\S*[\\/])?([^\\/\s]+)/, "$2");
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
};
