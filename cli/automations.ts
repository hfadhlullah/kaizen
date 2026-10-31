// Automations: a schedule that starts a kaizen run in one project. A fire goes through the
// same launchRun the board's Run button uses, in auto mode, so it runs every stage unattended
// (plan, build, review; approvals.review still holds unless auto_accept is on). Rules live in
// <state>/automations.json, history in <state>/automation-runs.json. Fires happen only while
// a board runs: its minute tick calls tickAutomations.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { agentEnabled } from "./agent-prefs.ts";
import { obeyed } from "./sources.ts";
import { CHILD_ENV, home, KNOWN_AGENTS, launchRun, type Item } from "./state.ts";

export const KINDS = ["hourly", "daily", "weekdays", "weekly", "cron"] as const;
export type Kind = (typeof KINDS)[number];
export type Rule = {
  id: string; name: string; text: string; cron: string; kind: Kind; enabled: boolean;
  agent?: string; precheck?: string; precheck_timeout: number; grace_minutes: number;
  last_fired_for: number; created: number;
};
export type Status = "pending" | "launched" | "launch_failed" | "skipped_precheck" | "skipped_missed" | "skipped_overlap" | "skipped_cap" | "skipped_unavailable";
export type Hist = { rule: string; fire: string; due: number; at: number; kind: "scheduled" | "manual"; status: Status; reason?: string };

export const DAILY_CAP = 24;
const KEEP = 100, MIN = 60_000, STUCK = 15 * MIN;

// ---- cron: five fields, no names, no extensions
const LIMITS: [number, number][] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
type Cron = { sets: Set<number>[]; domStar: boolean; dowStar: boolean };

export function parseCron(text: string): Cron | string {
  const f = text.trim().split(/\s+/);
  if (f.length !== 5) return "A cron has five fields: minute hour day-of-month month day-of-week.";
  const sets: Set<number>[] = [];
  for (let i = 0; i < 5; i++) {
    const [lo, hi] = LIMITS[i]!, set = new Set<number>();
    for (const part of f[i]!.split(",")) {
      const m = /^(?:(\*)|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part);
      if (!m || (m[4] !== undefined && !+m[4]) || (m[1] === undefined && m[3] === undefined && m[4] !== undefined)) return `"${part}" is not allowed in field ${i + 1}: use *, numbers, lists, ranges and steps only.`;
      const a = m[1] ? lo : +m[2]!, b = m[1] ? hi : m[3] !== undefined ? +m[3] : a;
      if (a < lo || b > hi || a > b) return `"${part}" is out of range in field ${i + 1} (${lo}-${hi}).`;
      for (let v = a; v <= b; v += m[4] ? +m[4] : 1) set.add(i === 4 && v === 7 ? 0 : v);
    }
    sets.push(set);
  }
  return { sets, domStar: f[2]!.startsWith("*"), dowStar: f[4]!.startsWith("*") };
}

const matches = (c: Cron, t: number) => {
  const d = new Date(t), [mi, h, dom, mo, dow] = c.sets as [Set<number>, Set<number>, Set<number>, Set<number>, Set<number>];
  if (!mi.has(d.getMinutes()) || !h.has(d.getHours()) || !mo.has(d.getMonth() + 1)) return false;
  const a = dom.has(d.getDate()), b = dow.has(d.getDay());
  // Standard cron: both day fields restricted means either one matching counts.
  return c.domStar || c.dowStar ? a && b : a || b;
};
const floor = (t: number) => Math.floor(t / MIN) * MIN;
const YEAR = 366 * 1440;

// First matching minute after `after`, within a year; null when there is none.
// ponytail: walks minute by minute (simple and correct across DST); cheap enough for a save and a fire.
export function nextRun(cron: string, after: number): number | null {
  const c = parseCron(cron);
  if (typeof c === "string") return null;
  for (let i = 1, t = floor(after); i <= YEAR; i++) if (matches(c, t + i * MIN)) return t + i * MIN;
  return null;
}

// Latest matching minute in (after, now], looking back at most a year.
export function dueSince(cron: string, after: number, now: number): number | null {
  const c = parseCron(cron);
  if (typeof c === "string") return null;
  let hit: number | null = null;
  for (let t = Math.max(floor(after), floor(now) - YEAR * MIN) + MIN; t <= now; t += MIN) if (matches(c, t)) hit = t;
  return hit;
}

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
// A preset's cron from "HH:MM" (hourly uses the minute) and a weekday name or number.
export function presetCron(kind: Kind, time: string, day: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m || +m[1]! > 23 || +m[2]! > 59) return "";
  const d = DAYS.indexOf(day.slice(0, 3).toLowerCase());
  const dow = d >= 0 ? d : /^[0-7]$/.test(day) ? day : "";
  if (kind === "hourly") return `${+m[2]!} * * * *`;
  if (kind === "daily") return `${+m[2]!} ${+m[1]!} * * *`;
  if (kind === "weekdays") return `${+m[2]!} ${+m[1]!} * * 1-5`;
  if (kind === "weekly") return dow === "" ? "" : `${+m[2]!} ${+m[1]!} * * ${dow}`;
  return "";
}

// ---- files: temp then rename; a bad rules file stops writers instead of being replaced
const rulesFile = (st: string) => join(st, "automations.json");
const histFile = (st: string) => join(st, "automation-runs.json");
function save(file: string, data: unknown) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  renameSync(tmp, file);
}
function load<T>(file: string): T[] | null {
  if (!existsSync(file)) return [];
  try { const j = JSON.parse(readFileSync(file, "utf8")); return Array.isArray(j) ? j : null; } catch { return null; }
}
export function readRules(st: string): Rule[] {
  const r = load<Rule>(rulesFile(st));
  if (!r) throw new Error("automations.json is unreadable: fix or remove it.");
  return r;
}
export const readHistory = (st: string): Hist[] => load<Hist>(histFile(st)) ?? [];
function writeHistory(st: string, h: Hist[]) {
  // Keep the newest KEEP per rule.
  const seen = new Map<string, number>(), out: Hist[] = [];
  for (const x of [...h].sort((a, b) => b.at - a.at)) { const n = (seen.get(x.rule) ?? 0) + 1; seen.set(x.rule, n); if (n <= KEEP) out.push(x); }
  if (load(histFile(st)) === null) renameSync(histFile(st), histFile(st) + ".bad");
  save(histFile(st), out.reverse());
}
function note(st: string, x: Hist) {
  const h = readHistory(st), i = h.findIndex((y) => y.fire === x.fire);
  if (i >= 0) h[i] = x; else h.push(x);
  writeHistory(st, h);
}

// ---- rules
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
export type Input = { name?: unknown; text?: unknown; kind?: unknown; time?: unknown; day?: unknown; cron?: unknown; agent?: unknown; precheck?: unknown; precheck_timeout?: unknown; grace_minutes?: unknown };

// A rule's fields from what a person typed, or the reason it is refused.
function build(i: Input, base?: Rule): Omit<Rule, "id" | "enabled" | "last_fired_for" | "created"> | string {
  const name = clip(i.name, 60).replace(/[\[\]\r\n]/g, " ").trim(), text = clip(i.text, 2000);
  if (!name) return "Give the automation a name.";
  if (text.length < 3) return "Write what the run should do.";
  const kind = (i.kind ?? base?.kind) as Kind;
  if (!KINDS.includes(kind)) return "Pick hourly, daily, weekdays, weekly or cron.";
  const cron = kind === "cron" ? clip(i.cron, 100) : presetCron(kind, String(i.time ?? "09:00"), String(i.day ?? "mon"));
  const c = parseCron(cron);
  if (!cron || typeof c === "string") return typeof c === "string" ? c : "Pick a valid time (HH:MM) and day.";
  if (nextRun(cron, Date.now()) === null) return "That schedule never runs.";
  const agent = clip(i.agent, 40);
  if (agent && !KNOWN_AGENTS.some((a) => a.cmd === agent)) return "Unknown agent.";
  const grace = i.grace_minutes === undefined || i.grace_minutes === "" ? 720 : Number(i.grace_minutes);
  if (!Number.isInteger(grace) || grace < 0 || grace > 10080) return "Grace is 0 to 10080 minutes.";
  const to = i.precheck_timeout === undefined || i.precheck_timeout === "" ? 60 : Number(i.precheck_timeout);
  if (!Number.isInteger(to) || to < 1 || to > 300) return "The check's time limit is 1 to 300 seconds.";
  return { name, text, cron, kind, agent: agent || undefined, precheck: clip(i.precheck, 500) || undefined, precheck_timeout: to, grace_minutes: grace };
}

const guard = (st: string) => (st === join(home, ".kaizen") ? "Automations belong to one project: open a project first." : null);

export function addRule(st: string, i: Input): Rule | string {
  const why = guard(st) ?? build(i);
  if (typeof why === "string") return why;
  let rules: Rule[];
  try { rules = readRules(st); } catch (e: any) { return e.message; }
  // A new automation never fires for the past.
  const r: Rule = { ...why, id: Math.random().toString(36).slice(2, 8), enabled: true, last_fired_for: floor(Date.now()), created: Date.now() };
  save(rulesFile(st), [...rules, r]);
  return r;
}

export function patchRule(st: string, id: string, f: (r: Rule) => Rule | string): Rule | string {
  const rules = readRules(st), i = rules.findIndex((r) => r.id === id);
  if (i < 0) return "No such automation.";
  const r = f(rules[i]!);
  if (typeof r === "string") return r;
  rules[i] = r;
  save(rulesFile(st), rules);
  return r;
}
export const updateRule = (st: string, id: string, i: Input) => patchRule(st, id, (r) => { const b = build(i, r); return typeof b === "string" ? b : { ...r, ...b, agent: b.agent, precheck: b.precheck, last_fired_for: floor(Date.now()) }; });
export const setEnabled = (st: string, id: string, on: boolean) => patchRule(st, id, (r) => ({ ...r, enabled: on, ...(on ? { last_fired_for: floor(Date.now()) } : {}) }));
export function removeRule(st: string, id: string) {
  const rules = readRules(st);
  if (!rules.some((r) => r.id === id)) return "No such automation.";
  save(rulesFile(st), rules.filter((r) => r.id !== id));
  writeHistory(st, readHistory(st).filter((h) => h.rule !== id));
  return null;
}

// ---- run link: the run whose request holds the fire's marker
export type Live = { run: string; stage: string; awaiting?: string } | null;
export function runOf(st: string, fire: string): Live {
  const re = new RegExp(`fire ${fire.replace(/[.]/g, "\\.")}(?![\\w.-])`);
  try {
    for (const run of readdirSync(join(st, "runs")).sort()) {
      let hit = false;
      try { hit = re.test(readFileSync(join(st, "runs", run, "00-request.md"), "utf8")); } catch { /* none yet */ }
      if (!hit) continue;
      let s: any = {};
      try { s = JSON.parse(readFileSync(join(st, "runs", run, "state.json"), "utf8")); } catch { /* none yet */ }
      return { run, stage: String(s.stage ?? "plan"), awaiting: s.awaiting ? String(s.awaiting) : undefined };
    }
  } catch { /* no runs */ }
  return null;
}

// The status a history line shows: a launched fire reads from its run; one with no run after 15 minutes failed.
export function shown(st: string, h: Hist, now = Date.now()): { status: string; run?: string } {
  if (h.status !== "launched" && h.status !== "pending") return { status: h.status };
  const l = runOf(st, h.fire);
  if (!l) return { status: now - h.at > STUCK ? "launch_failed" : h.status };
  const s = l.stage === "done" || l.stage === "abandoned" ? l.stage : l.awaiting ? "awaiting_approval" : "running";
  return { status: s, run: l.run };
}
// Open = still working. A launch whose run never shows the marker counts as open for a day (the agent may have dropped it), and a finished run whose terminal still lives is open too.
const open = (st: string, h: Hist, now: number, live?: Deps["live"]) => {
  const v = shown(st, h, now);
  if (v.run && live?.(st, v.run)) return true;
  if (v.status === "launch_failed") return !runOf(st, h.fire) && now - h.at < 86_400_000 && (h.status === "launched" || h.status === "pending");
  return v.status === "running" || v.status === "awaiting_approval" || v.status === "launched" || v.status === "pending";
};

// The command a precheck runs through: cmd on Windows, sh elsewhere.
export const shellArgv = (cmd: string, win = process.platform === "win32") => (win ? ["cmd", "/c", cmd] : ["sh", "-c", cmd]);

// ---- precheck
async function precheck(cmd: string, cwd: string, secs: number): Promise<string | null> {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k, v]) => v !== undefined && !CHILD_ENV.test(k))) as Record<string, string>;
  const win = process.platform === "win32";
  let p;
  try { p = Bun.spawn(shellArgv(cmd, win), { cwd, env, stdin: "ignore", stdout: "pipe", stderr: "pipe", detached: !win }); }
  catch (e: any) { return `could not start: ${e?.message ?? e}`; }
  let late = false;
  const timer = setTimeout(() => {
    late = true;
    try { if (win) Bun.spawn(["taskkill", "/T", "/F", "/PID", String(p.pid)], { stdout: "ignore", stderr: "ignore" }); else process.kill(-p.pid, "SIGKILL"); } catch { try { p.kill(9); } catch { /* gone */ } }
  }, secs * 1000);
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  const code = await p.exited;
  clearTimeout(timer);
  const tail = (out + err).trim().slice(-200);
  if (late) return `timed out after ${secs}s${tail ? `: ${tail}` : ""}`;
  return code === 0 ? null : `exit ${code}${tail ? `: ${tail}` : ""}`;
}

// ---- fire
export type Deps = { live?: (st: string, run: string) => boolean; launch?: typeof launchRun; now?: () => number; pick?: (st: string) => { card?: boolean; onChange?: () => void } };

// What the agent is started with: auto mode, the person's words behind the command-word guard, and the marker that ties the run to its history line.
export function promptOf(r: Rule, fire: string): Item {
  const one = r.text.replace(/\s+/g, " ").trim();
  const text = `auto ${obeyed(one) ? "Request: " : ""}${one} [automation ${r.name} fire ${fire}]`;
  return { severity: null, where: null, text, raw: text };
}

// One fire of one rule. Scheduled fires are claimed by an atomic mkdir, so two boards on one machine start one run. Null when another board took it.
export async function fire(st: string, r: Rule, kind: "scheduled" | "manual", due: number, deps: Deps = {}): Promise<Hist | null> {
  const now = deps.now ?? Date.now, t = now();
  const id = kind === "scheduled" ? `${r.id}.${due / MIN}` : `${r.id}.m${t}`;
  const base: Hist = { rule: r.id, fire: id, due, at: t, kind, status: "pending" };
  const done = (status: Status, reason?: string) => { const h = { ...base, status, ...(reason ? { reason } : {}) }; note(st, h); return h; };
  if (kind === "scheduled") {
    if (!claimed(st, id)) return null;
  }
  if (r.agent && !agentEnabled(r.agent)) return done("skipped_unavailable", "That agent is turned off in Settings → Agents.");
  const mine = readHistory(st).filter((h) => h.rule === r.id);
  if (mine.filter((h) => ["pending", "launched", "launch_failed"].includes(h.status) && t - h.at < 86_400_000).length >= DAILY_CAP) return done("skipped_cap", `${DAILY_CAP} launches in the last day.`);
  const last = mine.filter((h) => h.status === "launched" || h.status === "pending").sort((a, b) => b.at - a.at)[0];
  if (last && open(st, last, t, deps.live)) return done("skipped_overlap", "The previous run of this automation is not finished.");
  if (kind === "scheduled" && r.precheck) {
    const why = await precheck(r.precheck, dirname(st), r.precheck_timeout);
    if (why) return done("skipped_precheck", why);
  }
  note(st, base);
  // Never yolo: Settings' bypass preference applies as for any launch.
  const l = (deps.launch ?? launchRun)(promptOf(r, id), st, undefined, { agent: r.agent, ...deps.pick?.(st) });
  return l.ok ? done("launched") : done("launch_failed", l.why);
}

// Every enabled rule of every state dir that is due now: one fire for the latest due minute, never one per missed slot.
export async function tickAutomations(states: string[], deps: Deps = {}) {
  const now = (deps.now ?? Date.now)();
  let changed = false;
  for (const st of states) {
    let rules: Rule[];
    try { rules = readRules(st); } catch { continue; }
    for (const r of rules) {
      if (!r.enabled) continue;
      const d = dueSince(r.cron, r.last_fired_for, now);
      if (d === null) continue;
      patchRule(st, r.id, (x) => (d > x.last_fired_for ? { ...x, last_fired_for: d } : x));
      try {
        if (now - d > r.grace_minutes * MIN) {
          if (!claimed(st, `${r.id}.${d / MIN}`)) continue;
          note(st, { rule: r.id, fire: `${r.id}.${d / MIN}`, due: d, at: now, kind: "scheduled", status: "skipped_missed", reason: "The board was not running within the grace time." });
          changed = true;
        } else if (await fire(st, r, "scheduled", d, deps)) changed = true;
      } catch { /* the next due minute tries again */ }
    }
    try { prune(st, now); } catch { /* old claims stay */ }
  }
  return changed;
}
const claimed = (st: string, id: string) => {
  try { mkdirSync(join(st, "automation-claims"), { recursive: true }); mkdirSync(join(st, "automation-claims", id)); return true; } catch { return false; }
};
// Claims older than 30 days go.
function prune(st: string, now: number) {
  const dir = join(st, "automation-claims");
  if (existsSync(dir)) for (const c of readdirSync(dir)) if (now - statSync(join(dir, c)).mtimeMs > 30 * 86_400_000) rmSync(join(dir, c), { recursive: true, force: true });
}
