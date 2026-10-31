// Orchestration: one run split into workers, each in its own terminal, branch and folder.
// All of it lives in runs/<id>/workers.json. `kaizen worker` only writes requests into it;
// the board is the only thing that starts a worker, so no board running means none starts.
// Off by default: with it off no file is made and nothing here runs. Settings are read once,
// at `init`, and frozen into the file, so a change later never touches a run that is building.
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { argsOf, commandOf, readPrefs, withEnv, type Prefs } from "./agent-prefs.ts";
import { clip, reportBlocked, reportUnblock, validId } from "./report.ts";
import { read } from "./settings.ts";
import { accountEnv, accountForRun, agentFlags, agentUsable, detectDefaultAgent, MODEL_FLAGS, plainModel, promptArgs, readText, runAgent, YOLO_FLAGS } from "./state.ts";
import { branchOf, run as sh } from "./worktree.ts";

export type Status = "planned" | "requested" | "running" | "blocked" | "succeeded" | "failed" | "unverified" | "conflict" | "merged" | "stopped";
export type Worker = {
  id: string; title: string; owns: string[]; after: string[]; status: Status; branch: string; worktree: string;
  key?: string; bypass: boolean; agent?: string; model?: string; modelNote?: string; requested?: { agent?: string; model?: string };
  phase?: string; blocked?: { question: string; options: string[] };
  handback?: { outcome: string; summary: string; files: string[]; at: number }; requestedAt?: number;
};
export type Workers = {
  v: 1; frozen: { max: number; permissions: "own" | "bypass"; model?: string; at: number }; workers: Worker[];
  merge?: { status: "merged" | "conflict" | "failed"; sha0: string; conflicts?: string[]; why?: string };
};
export type Resolved = { on: boolean; max: number; permissions: "own" | "bypass"; model: string; why: string };
type Plan = { id: string; title: string; owns: string[]; after: string[] };

const git = (cwd: string, ...a: string[]) => sh(["git", ...a], cwd);
const runDir = (project: string, id: string) => join(project, ".kaizen", "runs", id);
const fileOf = (project: string, id: string) => join(runDir(project, id), "workers.json");
const stateOf = (project: string, id: string): any => {
  try { return validId(id) ? JSON.parse(readText(join(runDir(project, id), "state.json"))) : null; } catch { return null; }
};

export function readWorkers(project: string, id: string): Workers | null {
  try { const w = JSON.parse(readFileSync(fileOf(project, id), "utf8")); return w?.v === 1 && Array.isArray(w.workers) ? w : null; } catch { return null; }
}

// ponytail: mkdir lock, a real lock if workers ever exceed single digits.
function locked<T>(project: string, id: string, fn: () => T): T {
  const lock = fileOf(project, id) + ".lock";
  for (let i = 0; ; i++) {
    try { mkdirSync(lock); break; } catch {
      try { if (Date.now() - statSync(lock).mtimeMs > 10_000) rmSync(lock, { recursive: true }); } catch { /* gone */ }
      if (i > 60) throw new Error("workers.json is locked: try again");
      Bun.sleepSync(50);
    }
  }
  try { return fn(); } finally { rmSync(lock, { recursive: true, force: true }); }
}

// Read, change, write under the lock. `fn` returns a refusal to write nothing.
function update(project: string, id: string, fn: (w: Workers) => string | void): string | null {
  return locked(project, id, () => {
    const w = readWorkers(project, id);
    if (!w) return `no workers for ${id}: run \`kaizen worker init ${id}\``;
    const why = fn(w);
    if (why) return why;
    const f = fileOf(project, id), tmp = `${f}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(w, null, 2));
    renameSync(tmp, f);
    return null;
  });
}

/** Whether this run may use workers, and with what. The run's own pick, then the project, then global, then off. */
export function resolve(project: string, id: string, plat: string = process.platform): Resolved {
  const st = stateOf(project, id);
  const texts = [join(project, ".kaizen", "config.yml"), join(homedir(), ".kaizen", "config.yml")].filter(existsSync).map(readText);
  const pick = (k: string) => { for (const t of texts) { const v = read(t, k); if (v !== null) return v; } return null; };
  const max = Math.min(6, Math.max(1, parseInt(pick("orchestration.max_workers") ?? "3", 10) || 3));
  const permissions = pick("orchestration.permissions") === "bypass" ? "bypass" as const : "own" as const;
  // The run's own agent's model name, or "" (inherit); a name that is not plain reads as inherit.
  const cmd = runAgent(join(project, ".kaizen"), id)?.cmd ?? st?.agent, wm = typeof cmd === "string" && /^\w+$/.test(cmd) ? pick(`orchestration.worker_model.${cmd}`) : null;
  const model = wm && plainModel(wm) ? wm : "";
  const off = (why: string): Resolved => ({ on: false, max, permissions, model, why });
  if (!st) return off(`no run ${clip(id, 80)}`);
  const want = st.orchestration === "on" ? true : st.orchestration === "off" ? false : pick("orchestration.enabled") === "true";
  if (!want) return off("orchestration is off: turn it on in Settings > Orchestration, or `kaizen worker set <run> on`");
  if (plat === "win32") return off("workers do not run on Windows");
  if (st.runner === "lite") return off("a lite run does not use workers");
  if (!st.worktree || !st.branch || !existsSync(st.worktree)) return off("this run has no worktree: workers branch off the run's branch");
  if (!Bun.which("git")) return off("git is not installed");
  return { on: true, max, permissions, model, why: "" };
}

// A request older than this is the coordinator's abandoned wait: the board never acts on it.
const STALE_MS = 60_000;
const fresh = (x: Worker) => Date.now() - (x.requestedAt ?? 0) < STALE_MS;

const overlap = (a: string, b: string) => a === b || a.startsWith(b + "/") || b.startsWith(a + "/");
const norm = (p: string) => p.replace(/[`'"]/g, "").trim().replace(/^\.\//, "").replace(/(\/\*{1,2})?\/?$/, "");

/** The `## Workers` section of the plan: null when there is none. Lines: `w1 — title — owns: a, b — after: w0`. */
export function parsePlan(project: string, id: string): Plan[] | string | null {
  let text: string;
  try { text = readText(join(runDir(project, id), "01-plan.md")); } catch { return null; }
  const sec = /^## Workers[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text);
  if (!sec) return null;
  const out: Plan[] = [];
  for (const raw of sec[1]!.split("\n")) {
    const line = raw.replace(/^\s*[-*]\s+/, "").trim();
    if (!line || line.startsWith("<!--") || line.startsWith(">")) continue;
    const [wid, title, ...rest] = line.split(/\s+[—–]\s+|\s+--\s+/).map((s) => s.trim());
    if (!wid || !/^w\d{1,2}$/.test(wid)) return `"${clip(wid, 40)}" is not a worker id (w1, w2, ...) in the plan's ## Workers`;
    if (out.some((x) => x.id === wid)) return `worker ${wid} is listed twice`;
    const field = (k: string) => rest.find((r) => r.toLowerCase().startsWith(k + ":"))?.slice(k.length + 1).split(",").map(norm).filter(Boolean) ?? [];
    const owns = field("owns"), after = field("after");
    if (!title || !owns.length) return `${wid} needs a title and \`owns:\` paths`;
    if (after.some((a) => !out.some((x) => x.id === a))) return `${wid} is after a worker that is not listed before it`;
    out.push({ id: wid, title: clip(title, 120), owns, after });
  }
  return out.length ? out : null;
}

/**
 * Starts orchestration for a run in its build stage: reads the approved split, checks it and freezes the
 * settings. Off, or a plan with no split, writes nothing at all.
 */
export function init(project: string, id: string, plat?: string): { ok: true; n: number } | { ok: false; why: string } {
  const r = resolve(project, id, plat);
  if (!r.on) return { ok: false, why: `${r.why}. Build it normally` };
  const st = stateOf(project, id);
  if (st.stage !== "build") return { ok: false, why: `the run is in stage ${st.stage}: workers start in build` };
  if (readWorkers(project, id)) return { ok: false, why: `already set up: \`kaizen worker status --run ${id}\`` };
  const plan = parsePlan(project, id);
  if (plan === null) return { ok: false, why: "the plan has no ## Workers section. Build it normally" };
  if (typeof plan === "string") return { ok: false, why: plan };
  let approval = "";
  try { approval = readText(join(runDir(project, id), "02-approval.md")); } catch { /* none */ }
  if (!/^\s*workers:\s*approved\b/im.test(approval)) return { ok: false, why: "02-approval.md does not record the split as approved (a `workers: approved` line). Ask the user, or build it normally" };
  if (plan.length < 2) return { ok: false, why: "a split needs at least two workers. Build it normally" };
  if (plan.length > r.max) return { ok: false, why: `the plan has ${plan.length} workers and the most allowed is ${r.max}: change the plan or Settings > Orchestration` };
  for (const [i, a] of plan.entries()) for (const b of plan.slice(i + 1)) {
    const hit = a.owns.find((p) => b.owns.some((q) => overlap(p, q)));
    if (hit) return { ok: false, why: `${a.id} and ${b.id} both own \`${hit}\`: split the files so no path has two owners` };
  }
  const w: Workers = {
    v: 1, frozen: { max: r.max, permissions: r.permissions, model: r.model, at: Date.now() },
    workers: plan.map((p) => ({ ...p, status: "planned", branch: `${branchOf(id)}-${p.id}`, worktree: join(project, ".kaizen", "wt", `${id}-${p.id}`), bypass: false })),
  };
  const f = fileOf(project, id);
  locked(project, id, () => { writeFileSync(f + ".tmp", JSON.stringify(w, null, 2)); renameSync(f + ".tmp", f); });
  return { ok: true, n: plan.length };
}

// The same check for the CLI's request and the board's start: never trust the file alone.
function startable(project: string, id: string, w: Workers, x: Worker, plat: string = process.platform): string | null {
  const st = stateOf(project, id);
  if (plat === "win32") return "workers do not run on Windows";
  if (st?.stage !== "build") return `the run is in stage ${st?.stage}: workers run in build`;
  if (w.workers.filter((o) => o !== x && o.status !== "planned").length + 1 > w.frozen.max) return `the most allowed is ${w.frozen.max} workers for this run`;
  const unmet = x.after.find((a) => w.workers.find((o) => o.id === a)?.status !== "succeeded");
  if (unmet) return `${unmet} must succeed first (it is ${w.workers.find((o) => o.id === unmet)?.status ?? "unknown"})`;
  return null;
}

/** `kaizen worker start`: asks the board to open the worker, then waits for it to say running. */
export function requestStart(project: string, id: string, wid: string, waitMs = 30_000): { ok: boolean; why: string } {
  const before = readWorkers(project, id)?.workers.find((x) => x.id === wid);
  if (!before) return { ok: false, why: `no worker ${clip(wid, 20)}: \`kaizen worker status --run ${id}\`` };
  if (before.status === "running") return { ok: true, why: `${wid} is already running` };
  const why = update(project, id, (w) => {
    const x = w.workers.find((o) => o.id === wid)!;
    if (x.status !== "planned" && x.status !== "requested") return `${wid} is ${x.status}: only a planned worker starts`;
    const bad = startable(project, id, w, x);
    if (bad) return bad;
    x.status = "requested"; x.requestedAt = Date.now();
  });
  if (why) return { ok: false, why };
  const until = Date.now() + waitMs;
  for (;;) {
    const x = readWorkers(project, id)?.workers.find((o) => o.id === wid);
    if (x && x.status !== "requested") return x.status === "running" ? { ok: true, why: `${wid} is running` } : { ok: false, why: `${wid} ${x.status}: ${x.handback?.summary ?? ""}` };
    if (Date.now() >= until) {
      update(project, id, (w) => { const o = w.workers.find((o) => o.id === wid); if (o?.status === "requested") o.status = "planned"; else return "moved on"; });
      return { ok: false, why: "the board did not start it: is `kaizen web` running?" };
    }
    Bun.sleepSync(250);
  }
}

export type Launch = { argv: string[]; title: string; bypass: boolean; agent: string; model?: string; cwd: string; env: Record<string, string>; trust?: string; modelNote?: string };

const brief = (project: string, id: string, x: Worker) =>
  `You are worker ${x.id} of run ${id}: ${x.title}. You are alone in your own git worktree (${x.worktree}) on branch ${x.branch}. ` +
  `Do this one task and own only these paths: ${x.owns.join(", ")}. Change nothing else. Read ${join(runDir(project, id), "01-plan.md")} for the plan. ` +
  `Say where you are with: kaizen worker report phase "<text>". If you need the user, never ask in this chat: run kaizen worker report blocked "<question>" and wait. ` +
  `When done, commit all your work on this branch, then run: kaizen worker report done --outcome succeeded --summary "<what you did>" --files <a,b>. ` +
  `If you cannot finish, use --outcome failed. Do not merge, push or start other workers.`;

/**
 * The launch line for one worker. Never reads the user's bypass preference: a worker is in bypass only
 * when this run's frozen Orchestration permissions say so, and its tab says so too.
 */
export function launchOf(project: string, id: string, x: Worker, permissions: "own" | "bypass", prefs: Prefs = readPrefs(), pick = ""): Launch | string {
  const own = runAgent(join(project, ".kaizen"), id), st = stateOf(project, id);
  const agent = detectDefaultAgent(project, own?.cmd ?? st?.agent);
  if (!agentUsable(agent.cmd)) return `${agent.name} is not available: see Settings > Agents`;
  // inherit keeps the run's own model; a pick goes through MODEL_FLAGS, so a tool with no model flag runs without one.
  const picked = pick && plainModel(pick) ? pick : undefined;
  const model = picked ?? (own?.cmd === agent.cmd && own.model && plainModel(own.model) ? own.model : undefined);
  const acct = accountForRun(project, id, agent.cmd);
  if (acct.error) return acct.error;
  const bypass = permissions === "bypass" && !!YOLO_FLAGS[agent.cmd];
  const flags = [...agentFlags(project, agent.cmd, undefined, model), ...(bypass ? YOLO_FLAGS[agent.cmd]! : []), ...argsOf(agent.cmd, prefs)];
  const line = withEnv([commandOf(agent.cmd, prefs), ...flags, ...promptArgs(agent.cmd, brief(project, id, x))], agent.cmd, prefs);
  return {
    argv: acct.dir ? ["env", ...accountEnv(acct), ...line] : line, title: `Worker ${x.id}${bypass ? " · bypass" : ""}`, bypass, agent: agent.cmd,
    model: picked ? (MODEL_FLAGS[agent.cmd] ? picked : undefined) : model ?? agentFlags(project, agent.cmd).join(" ").match(/\S+$/)?.[0], cwd: x.worktree,
    modelNote: picked && !MODEL_FLAGS[agent.cmd] ? `${agent.name} takes no model flag: "${picked}" was ignored` : undefined,
    env: { KAIZEN_RUN_ID: id, KAIZEN_WORKER: x.id }, trust: acct.dir ? join(acct.dir, ".claude.json") : undefined,
  };
}

/** Board side: checks a requested worker, makes its branch and folder off the run's branch, returns how to launch it. */
export function startWorker(project: string, id: string, wid: string, prefs?: Prefs): { ok: true; launch: Launch } | { ok: false; why: string } {
  const w = readWorkers(project, id), x = w?.workers.find((o) => o.id === wid), st = stateOf(project, id);
  if (!w || !x || !st) return { ok: false, why: "no such worker" };
  if (x.status !== "requested") return { ok: false, why: `${wid} is ${x.status}, not requested` };
  if (!fresh(x)) return { ok: false, why: `${wid}'s request is stale: ask again with \`kaizen worker start ${wid}\`` };
  const bad = startable(project, id, w, x);
  if (bad) return { ok: false, why: bad };
  const plan = parsePlan(project, id);
  if (typeof plan === "string" || !plan?.some((p) => p.id === wid && p.owns.join() === x.owns.join())) return { ok: false, why: `${wid} is not in the plan's ## Workers` };
  if (!st.worktree || !existsSync(st.worktree) || x.branch !== `${branchOf(id)}-${wid}`) return { ok: false, why: "the run has no worktree to branch from" };
  const launch = launchOf(project, id, x, w.frozen.permissions, prefs, w.frozen.model);
  if (typeof launch === "string") return { ok: false, why: launch };
  if (!existsSync(x.worktree)) {
    const have = git(project, "rev-parse", "--verify", "--quiet", `refs/heads/${x.branch}`).ok;
    // A dependent worker starts from the worker it follows, so it sees that code; any further `after` workers are merged in.
    const dep = x.after.map((a) => w.workers.find((o) => o.id === a)!.branch);
    const add = git(project, "worktree", "add", ...(have ? [x.worktree, x.branch] : ["--no-track", "-b", x.branch, x.worktree, dep[0] ?? st.branch]));
    if (!add.ok) return { ok: false, why: add.why };
    if (!have) for (const b of dep.slice(1)) {
      const m = git(x.worktree, "merge", "--no-edit", b);
      if (!m.ok) { git(x.worktree, "merge", "--abort"); git(project, "worktree", "remove", "--force", x.worktree); git(project, "update-ref", "-d", `refs/heads/${x.branch}`); return { ok: false, why: `${wid} could not take ${b}: ${m.why}` }; }
    }
  }
  return { ok: true, launch };
}

// A live worker gone quiet with no report: it may have finished and failed to say so.
export const workerStale = (x: { status: string; key?: string }, pty: { alive?: boolean; busy?: boolean; asking?: boolean; lastOut?: number } | null | undefined, now: number, minutes: number) =>
  x.status === "running" && !!pty?.alive && !pty.busy && !pty.asking && now - (pty.lastOut ?? now) > 2 * minutes * 60_000;

export const markRunning = (project: string, id: string, wid: string, key: string, l: Launch) =>
  update(project, id, (w) => {
    const x = w.workers.find((o) => o.id === wid)!;
    Object.assign(x, { status: "running", key, bypass: l.bypass, agent: l.agent, model: l.model, modelNote: l.modelNote, requested: { agent: l.agent, model: l.model } });
  });

/** The board could not start it: the worker fails, with the reason where `start` and the card read it. */
export const failStart = (project: string, id: string, wid: string, why: string) =>
  update(project, id, (w) => {
    const x = w.workers.find((o) => o.id === wid)!;
    x.status = "failed"; x.handback = { outcome: "failed", summary: clip(why, 300), files: [], at: Date.now() };
  });

/** A worker still `running` or `blocked` whose terminal is gone, with no hand-back, is unverified. */
export function sweep(project: string, id: string, alive: (key: string) => boolean): boolean {
  const w = readWorkers(project, id);
  if (!w?.workers.some((x) => (x.status === "running" || x.status === "blocked") && !(x.key && alive(x.key)))) return false;
  return !update(project, id, (m) => {
    for (const x of m.workers) if ((x.status === "running" || x.status === "blocked") && !(x.key && alive(x.key)) && !x.handback) x.status = "unverified";
  });
}

/** Runs of this project with a worker waiting for the board. */
export function requested(project: string): { id: string; wid: string }[] {
  const dir = join(project, ".kaizen", "runs");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((id) => readWorkers(project, id)?.workers.filter((x) => x.status === "requested" && fresh(x)).map((x) => ({ id, wid: x.id })) ?? []);
}

/** A worker's own say: phase, blocked, unblock, done. Writes only that worker (and the run's blocker). */
export function report(project: string, id: string, wid: string, kind: string, a: { text?: string; options?: string[]; outcome?: string; summary?: string; files?: string[] } = {}): string | null {
  const state = join(project, ".kaizen");
  return update(project, id, (w) => {
    const x = w.workers.find((o) => o.id === wid);
    if (!x) return `no worker ${clip(wid, 20)}: \`kaizen worker status --run ${id}\``;
    if (x.status !== "running" && x.status !== "blocked") return `${wid} is ${x.status}: only a running worker reports`;
    if (kind === "phase" && a.text) { x.phase = clip(a.text, 120); return; }
    if (kind === "blocked" && a.text) {
      x.status = "blocked"; x.blocked = { question: clip(a.text, 300), options: (a.options ?? []).slice(0, 4).map((o) => clip(o, 80)) };
      return reportBlocked(state, id, `${wid}: ${a.text}`, a.options ?? []) ?? undefined;
    }
    if (kind === "unblock") {
      x.status = "running"; delete x.blocked;
      if (!w.workers.some((o) => o.blocked)) reportUnblock(state, id);
      return;
    }
    if (kind === "done") {
      if (a.outcome !== "succeeded" && a.outcome !== "failed") return "outcome is succeeded or failed";
      if (!a.summary) return "done needs --summary <text>";
      if (git(x.worktree, "status", "--porcelain").out) return "uncommitted changes in your worktree: commit first, then report done";
      x.status = a.outcome; delete x.blocked;
      x.handback = { outcome: a.outcome, summary: clip(a.summary, 600), files: (a.files ?? []).slice(0, 200).map((f) => clip(f, 300)), at: Date.now() };
      if (!w.workers.some((o) => o.blocked)) reportUnblock(state, id);
      return;
    }
    return "report phase <text> | blocked <question> | unblock | done --outcome succeeded|failed --summary <text>";
  });
}

const NEXT: Partial<Record<Status, string>> = {
  planned: "start it: `kaizen worker start <wid>`", requested: "wait for the board, or check `kaizen web` is running", running: "wait for it to report done",
  blocked: "answer it on the run's card, then it reports unblock", failed: "stop and tell the user; nothing is merged",
  unverified: "its terminal ended without a hand-back: open its folder, check the work, and tell the user", conflict: "tell the user; resolve it by hand", stopped: "tell the user",
};

/** Merges every worker's branch into the run's own, in plan order, only when all succeeded. A conflict undoes all of it. */
export function merge(project: string, id: string): { ok: true; shas: string[]; left: string[] } | { ok: false; why: string } {
  const w = readWorkers(project, id), st = stateOf(project, id);
  if (!w || !st) return { ok: false, why: `no workers for ${id}: run \`kaizen worker init ${id}\`` };
  if (w.workers.every((x) => x.status === "merged")) return { ok: false, why: "already merged" };
  const not = w.workers.find((x) => x.status !== "succeeded");
  if (not) return { ok: false, why: `${not.id} is ${not.status}, so nothing is merged: ${NEXT[not.status]?.replace("<wid>", not.id)}` };
  const cwd = st.worktree as string;
  if (!cwd || !existsSync(cwd)) return { ok: false, why: "the run has no worktree to merge into" };
  if (git(cwd, "rev-parse", "--abbrev-ref", "HEAD").out !== st.branch) return { ok: false, why: `the run's worktree is not on ${st.branch}: check it out there first` };
  if (git(cwd, "status", "--porcelain").out) return { ok: false, why: "the run's worktree has uncommitted changes: commit them first, then merge" };
  // A branch may change only what its worker owns. Commits it took from the workers it follows are theirs, not its own.
  for (const x of w.workers) {
    const skip = x.after.flatMap((a) => ["^" + w.workers.find((o) => o.id === a)!.branch]);
    const out = git(cwd, "log", "--no-merges", "--name-only", "--format=", x.branch, "^" + st.branch, ...skip).out.split("\n").filter(Boolean);
    const stray = [...new Set(out)].filter((p) => !x.owns.some((o) => p === o || p.startsWith(o + "/")));
    if (stray.length) return { ok: false, why: `${x.id} changed paths it does not own (${stray.slice(0, 5).join(", ")}): nothing is merged. Move those changes out of its branch, or tell the user` };
  }
  const sha0 = git(cwd, "rev-parse", "HEAD").out, shas: string[] = [];
  for (const x of w.workers) {
    const m = git(cwd, "merge", "--no-ff", "--no-edit", x.branch);
    if (m.ok) { shas.push(git(cwd, "rev-parse", "HEAD").out); continue; }
    // Conflict or any other refusal: the run's branch goes back to where it was, nothing partial stays.
    const files = git(cwd, "diff", "--name-only", "--diff-filter=U").out.split("\n").filter(Boolean);
    git(cwd, "merge", "--abort");
    git(cwd, "reset", "--hard", sha0);
    const why = files.length ? `${x.id} conflicts in ${files.join(", ")}` : `${x.id} would not merge: ${m.why}`;
    update(project, id, (d) => {
      if (files.length) d.workers.find((o) => o.id === x.id)!.status = "conflict";
      d.merge = { status: files.length ? "conflict" : "failed", sha0, ...(files.length ? { conflicts: files } : { why: clip(m.why, 200) }) };
    });
    reportBlocked(join(project, ".kaizen"), id, `${why}. The run's branch is back at ${sha0.slice(0, 7)}; nothing is merged. Resolve it by hand.`);
    return { ok: false, why: `${why}. The run's branch is back at ${sha0.slice(0, 7)}; nothing is merged` };
  }
  // Safe removal only, from the run's own folder so `-d` checks against its branch: `worktree remove` refuses a dirty folder and `branch -d` an unmerged branch.
  const left: string[] = [];
  for (const x of w.workers) {
    const r = git(cwd, "worktree", "remove", x.worktree), b = git(cwd, "branch", "-d", x.branch);
    if (!r.ok) left.push(`${x.id} folder ${x.worktree}: ${clip(r.why, 120)}`);
    if (!b.ok) left.push(`${x.id} branch ${x.branch}: ${clip(b.why, 120)}`);
  }
  update(project, id, (d) => { for (const x of d.workers) x.status = "merged"; d.merge = { status: "merged", sha0 }; });
  return { ok: true, shas, left };
}

/** `kaizen worker status` text. */
export function statusText(project: string, id: string): string {
  const w = readWorkers(project, id);
  if (!w) { const r = resolve(project, id); return r.on ? `no workers yet for ${id}: \`kaizen worker init ${id}\`` : r.why; }
  return [
    `max ${w.frozen.max} · permissions ${w.frozen.permissions} · model ${w.frozen.model || "inherit"} (frozen)`,
    ...w.workers.map((x) => `${x.id}  ${x.status}${x.bypass ? " · bypass" : ""}  ${x.title}${x.phase ? ` · ${x.phase}` : ""}${x.blocked ? ` · asks: ${x.blocked.question}` : ""}${x.modelNote ? ` · ${x.modelNote}` : ""}${x.handback ? ` · ${x.handback.summary}` : ""}`),
    ...(w.merge ? [`merge: ${w.merge.status}${w.merge.conflicts ? ` (${w.merge.conflicts.join(", ")})` : ""}`] : []),
  ].join("\n");
}

/** `kaizen worker set <run> on|off|clear`: this run's own switch, in its state.json. */
export function setRun(project: string, id: string, to: string): string | null {
  const f = join(runDir(project, id), "state.json"), s = stateOf(project, id);
  if (!s) return `no run ${clip(id, 80)}`;
  if (to !== "on" && to !== "off" && to !== "clear") return "kaizen worker set <run> on|off|clear";
  if (readWorkers(project, id)) return "this run already has workers: its settings are frozen";
  if (to === "clear") delete s.orchestration; else s.orchestration = to;
  const tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(s));
  renameSync(tmp, f);
  return null;
}
