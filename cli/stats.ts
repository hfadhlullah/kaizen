// `kaizen stats [<id>] [--json]` and `kaizen related <path...>`: read-only views over
// the files every run already writes. Nothing here writes, so old runs get stats too.
// Stage times come from runs/<id>/stages.log (written by kaizen state / kaizen done), not
// file mtimes: files are rewritten later in a run, so their times say nothing per stage.
// A run with no log (every run before it existed) shows "–".
import { readFileSync, readdirSync, statSync, existsSync, openSync, readSync, closeSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { changedPaths, projectOf } from "./state.ts";
import { trackOf } from "./knowledge.ts";

const read = (f: string) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };
const mtime = (f: string) => { try { return statSync(f).mtimeMs; } catch { return 0; } };

export type RunStat = {
  id: string; stage: string; track: string; runner: string; mode: string;
  reviewed: boolean; fixed: boolean; unverified: boolean;
  explore: number | null; plan: number | null; wait: number | null; build: number | null; review: number | null;
};

export function runStat(state: string, id: string): RunStat | null {
  const dir = join(state, "runs", id);
  let s: any;
  try { s = JSON.parse(read(join(dir, "state.json"))); } catch { return null; }
  const t = (f: string) => mtime(join(dir, f));
  let iters: string[] = [];
  try { iters = readdirSync(join(dir, "05-iterations")); } catch { /* none */ }
  return {
    id, stage: String(s.stage ?? "?"), track: s.track ? trackOf(String(s.track)) : "?",
    runner: String(s.runner ?? "?"), mode: String(s.mode ?? "?"),
    reviewed: existsSync(join(dir, "04-review.md")),
    fixed: iters.length > 0,
    unverified: /CANNOT VERIFY/.test(read(join(dir, "04-review.md"))),
    ...stageTimes(read(join(dir, "stages.log")), t("00-request.md")),
  };
}

// Each interval between log lines is charged to the state at its start: waiting when
// awaiting is set, else the stage. The interval before the first line is planning,
// from the request's write (00-request.md is written once, at intake).
export function stageTimes(log: string, start: number) {
  const out = { explore: null as number | null, plan: null as number | null, wait: null as number | null, build: null as number | null, review: null as number | null };
  const rows = log.split("\n").map((l) => l.trim().split(/\s+/)).filter((r) => r.length >= 3 && !isNaN(Date.parse(r[0]!)))
    .map(([at, stage, awaiting]) => ({ at: Date.parse(at!), stage: stage!, waiting: awaiting !== "-" }));
  if (!rows.length) return out;
  // Only a log that starts at plan or build covers planning; one that starts later (the
  // run began on an older kaizen, or by hand) has an unknown gap, left uncounted.
  const lead = start && start <= rows[0]!.at && (rows[0]!.stage === "plan" || rows[0]!.stage === "build");
  const seq = lead ? [{ at: start, stage: "plan", waiting: false }, ...rows] : rows;
  for (let i = 0; i + 1 < seq.length; i++) {
    const a = seq[i]!, d = seq[i + 1]!.at - a.at;
    if (d < 0 || a.stage === "done" || a.stage === "abandoned") continue;
    const k = a.waiting ? "wait" : (a.stage as keyof typeof out);
    if (k in out) out[k] = (out[k] ?? 0) + d;
  }
  return out;
}

export function allStats(state: string): RunStat[] {
  let ids: string[] = [];
  try { ids = readdirSync(join(state, "runs")); } catch { return []; }
  return ids.sort().map((id) => runStat(state, id)).filter((r): r is RunStat => !!r);
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const count = (rs: RunStat[], k: keyof RunStat) => rs.reduce((o, r) => { const v = String(r[k]); o[v] = (o[v] ?? 0) + 1; return o; }, {} as Record<string, number>);

export function summary(rs: RunStat[]) {
  const reviewed = rs.filter((r) => r.reviewed);
  const med = (k: "explore" | "plan" | "wait" | "build" | "review") => median(rs.map((r) => r[k]).filter((v): v is number => v !== null));
  return {
    runs: rs.length,
    stage: count(rs, "stage"), track: count(rs, "track"), runner: count(rs, "runner"), mode: count(rs, "mode"),
    reviewed: reviewed.length,
    fixed: rs.filter((r) => r.fixed).length,
    unverified: rs.filter((r) => r.unverified).length,
    timed: rs.filter((r) => r.explore !== null || r.plan !== null || r.build !== null).length,
    median: { explore: med("explore"), plan: med("plan"), wait: med("wait"), build: med("build"), review: med("review") },
  };
}

// Tokens a Claude run used, from its session log: `~/.claude/projects/*/<session>.jsonl`.
// One session can carry several runs, so only lines inside [from, to] count.
export type Tokens = { input: number; output: number; cacheRead: number; cacheWrite: number; turns: number };
export function sessionLog(session: string, home = homedir()): string | null {
  const root = join(home, ".claude", "projects");
  let dirs: string[] = [];
  try { dirs = readdirSync(root); } catch { return null; }
  for (const d of dirs) { const f = join(root, d, `${session}.jsonl`); if (existsSync(f)) return f; }
  return null;
}
export function tokensIn(file: string, from: number, to: number): Tokens {
  const t: Tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turns: 0 };
  // Streamed in chunks: a long session log runs to hundreds of MB.
  const fd = openSync(file, "r"), buf = Buffer.alloc(1 << 20);
  let rest = "";
  const line = (l: string) => {
    if (!l.includes('"usage"')) return;
    let j: any;
    try { j = JSON.parse(l); } catch { return; }
    const at = Date.parse(j.timestamp ?? ""), u = j.message?.usage;
    if (!u || !(at >= from && at <= to)) return;
    t.input += u.input_tokens ?? 0; t.output += u.output_tokens ?? 0;
    t.cacheRead += u.cache_read_input_tokens ?? 0; t.cacheWrite += u.cache_creation_input_tokens ?? 0;
    t.turns++;
  };
  try {
    for (let n; (n = readSync(fd, buf, 0, buf.length, null)) > 0;) {
      const parts = (rest + buf.toString("utf8", 0, n)).split("\n");
      rest = parts.pop()!;
      parts.forEach(line);
    }
    line(rest);
  } finally { closeSync(fd); }
  return t;
}
export function runTokens(state: string, id: string, home = homedir()): Tokens | null {
  const dir = join(state, "runs", id);
  let s: any;
  try { s = JSON.parse(read(join(dir, "state.json"))); } catch { return null; }
  if (!s.session || (s.agent && s.agent !== "claude")) return null;
  const log = sessionLog(String(s.session), home);
  if (!log) return null;
  const from = mtime(join(dir, "00-request.md")), to = Date.parse(s.updated ?? "") || mtime(join(dir, "state.json"));
  return from ? tokensIn(log, from, to) : null;
}

// Earlier runs whose report names any of these paths as changed, newest first.
export function related(state: string, paths: string[], limit = 5): { id: string; title: string; open: number }[] {
  const want = new Set(paths.map((p) => p.replace(/^\.\//, "")));
  const project = projectOf(state);
  let ids: string[] = [];
  try { ids = readdirSync(join(state, "runs")).sort().reverse(); } catch { return []; }
  const out: { id: string; title: string; open: number }[] = [];
  for (const id of ids) {
    const dir = join(state, "runs", id), impl = read(join(dir, "03-impl.md"));
    if (!impl || !changedPaths(impl, project).some((p) => want.has(p))) continue;
    const title = read(join(dir, "00-request.md")).split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "").slice(0, 90) ?? "";
    const open = (read(join(dir, "06-backlog.md")).match(/^- open:/gm) ?? []).length;
    out.push({ id, title, open });
    if (out.length >= limit) break;
  }
  return out;
}

const dur = (ms: number | null) => ms === null ? "–" : ms < 3.6e6 ? `${Math.round(ms / 6e4)}m` : `${(ms / 3.6e6).toFixed(1)}h`;
const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "–");
const kv = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", ");

export function statsText(state: string, id?: string, json = false): string {
  if (id) {
    const r = runStat(state, id);
    if (!r) return `no run ${id}`;
    const t = runTokens(state, id);
    if (json) return JSON.stringify({ ...r, tokens: t }, null, 2);
    const tok = t ? `${t.input + t.cacheWrite + t.cacheRead} in (${t.cacheRead} from cache), ${t.output} out, ${t.turns} turns` : "n/a";
    return [`${r.id}  ${r.stage} · ${r.track} · ${r.runner} · ${r.mode}`,
      `explore ${dur(r.explore)} · plan ${dur(r.plan)} · waiting for approval ${dur(r.wait)} · build ${dur(r.build)} · review ${dur(r.review)} (from stages.log)`,
      `fix round: ${r.fixed ? "yes" : "no"} · CANNOT VERIFY: ${r.unverified ? "yes" : "no"}`,
      `tokens: ${tok}`].join("\n");
  }
  const s = summary(allStats(state));
  if (json) return JSON.stringify(s, null, 2);
  return [`${s.runs} runs — ${kv(s.stage)}`,
    `track: ${kv(s.track)}`, `runner: ${kv(s.runner)} · mode: ${kv(s.mode)}`,
    `fix round: ${s.fixed} of ${s.reviewed} reviewed (${pct(s.fixed, s.reviewed)}) · CANNOT VERIFY in ${s.unverified} reviews (${pct(s.unverified, s.reviewed)})`,
    `median: explore ${dur(s.median.explore)} · plan ${dur(s.median.plan)} · waiting for approval ${dur(s.median.wait)} · build ${dur(s.median.build)} · review ${dur(s.median.review)} (runs with a stages.log: ${s.timed})`].join("\n");
}
