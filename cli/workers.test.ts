// Orchestration against throwaway git repos: nothing here touches a real project or agent folder.
import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readReport, signalOf } from "./report.ts";
import { workerStale, init, launchOf, merge, readWorkers, report, requested, requestStart, resolve, setRun, startWorker, statusText, type Status } from "./workers.ts";

const win = process.platform === "win32";
const t = win ? test.skip : test;
const roots: string[] = [];
afterAll(() => { for (const r of roots) rmSync(r, { recursive: true, force: true }); });

const g = (cwd: string, ...a: string[]) => {
  const r = Bun.spawnSync(["git", ...a], { cwd, stdin: "ignore" });
  if (r.exitCode !== 0) throw new Error(`git ${a.join(" ")}: ${r.stderr.toString()}`);
  return r.stdout.toString().trim();
};

// A repo with a run worktree on kaizen/<id>, a plan with two workers, and an approval that records the split.
let n = 0;
function fixture(o: { state?: object; plan?: string; approved?: boolean } = {}) {
  const project = mkdtempSync(join(tmpdir(), "kaizen-workers-"));
  roots.push(project);
  const id = `2026-10-31-t${++n}`;
  g(project, "init", "-q", "-b", "main");
  g(project, "config", "user.email", "t@t"); g(project, "config", "user.name", "t");
  writeFileSync(join(project, "a.txt"), "one\ntwo\nthree\n");
  g(project, "add", "."); g(project, "commit", "-qm", "base");
  const wt = join(project, ".kaizen", "wt", id), branch = `kaizen/${id}`;
  g(project, "worktree", "add", "-q", "-b", branch, wt);
  const dir = join(project, ".kaizen", "runs", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "state.json"), JSON.stringify({ id, stage: "build", runner: "full", agent: "claude", orchestration: "on", worktree: wt, branch, ...o.state }));
  writeFileSync(join(dir, "01-plan.md"), o.plan ?? "# Plan\n\n## Workers\n- w1 — left half — owns: src/left, a.txt\n- w2 — right half — owns: src/right\n\n## Goal\nx\n");
  if (o.approved !== false) writeFileSync(join(dir, "02-approval.md"), "# Approval\n\nworkers: approved\n");
  return { project, id, wt, branch, dir };
}

// Marks a worker with a status and, when asked, gives it a real worktree and a committed change.
function setup(f: ReturnType<typeof fixture>, status: Status | Status[], edits?: Record<string, [string, string]>) {
  expect(init(f.project, f.id)).toEqual({ ok: true, n: 2 });
  const w = readWorkers(f.project, f.id)!;
  w.workers.forEach((x, i) => {
    x.status = Array.isArray(status) ? status[i]! : status;
    g(f.project, "worktree", "add", "-q", "-b", x.branch, x.worktree, f.branch);
    const e = edits?.[x.id];
    if (e) { mkdirSync(dirname(join(x.worktree, e[0])), { recursive: true }); writeFileSync(join(x.worktree, e[0]), e[1]); g(x.worktree, "add", "."); g(x.worktree, "commit", "-qm", x.id); }
  });
  writeFileSync(join(f.dir, "workers.json"), JSON.stringify(w));
}
const head = (f: ReturnType<typeof fixture>) => g(f.wt, "rev-parse", "HEAD");

t("G-01 off: init writes nothing, status says off, the board finds nothing to start", () => {
  const f = fixture({ state: { orchestration: undefined } });
  expect(resolve(f.project, f.id).on).toBe(false);
  const r = init(f.project, f.id);
  expect(r.ok).toBe(false);
  expect(existsSync(join(f.dir, "workers.json"))).toBe(false);
  expect(statusText(f.project, f.id)).toContain("orchestration is off");
  expect(requested(f.project)).toEqual([]);
});

t("G-02 lite, Windows and no worktree each resolve off with a reason", () => {
  expect(resolve(...(([f]) => [f.project, f.id] as const)([fixture({ state: { runner: "lite" } })]))).toMatchObject({ on: false, why: expect.stringContaining("lite") });
  const w = fixture();
  expect(resolve(w.project, w.id, "win32")).toMatchObject({ on: false, why: expect.stringContaining("Windows") });
  const n = fixture({ state: { worktree: undefined, branch: undefined } });
  expect(resolve(n.project, n.id)).toMatchObject({ on: false, why: expect.stringContaining("no worktree") });
  expect(resolve(w.project, w.id)).toMatchObject({ on: true });
});

t("G-03 a worker has no bypass flag under own, even with global bypass; with bypass it is flagged and titled", () => {
  const f = fixture();
  const prefs = join(f.project, "agents.json");
  writeFileSync(prefs, JSON.stringify({ permissions: "bypass", agents: { claude: { command: "/bin/sh" } } }));
  process.env.KAIZEN_AGENT_PREFS = prefs;
  try {
    init(f.project, f.id);
    const x = readWorkers(f.project, f.id)!.workers[0]!;
    const own = launchOf(f.project, f.id, x, "own");
    if (typeof own === "string") throw new Error(own);
    expect(own.argv.join(" ")).not.toContain("dangerously");
    expect([own.bypass, own.title]).toEqual([false, "Worker w1"]);
    const by = launchOf(f.project, f.id, x, "bypass");
    if (typeof by === "string") throw new Error(by);
    expect(by.argv).toContain("--dangerously-skip-permissions");
    expect([by.bypass, by.title]).toEqual([true, "Worker w1 · bypass"]);
  } finally { delete process.env.KAIZEN_AGENT_PREFS; }
});

t("G-04 merge refuses unless every worker succeeded, and merges nothing", () => {
  for (const bad of ["failed", "blocked", "unverified", "running", "requested"] as Status[]) {
    const f = fixture();
    setup(f, ["succeeded", bad], { w1: ["src-left.txt", "l"] });
    const before = head(f), r = merge(f.project, f.id);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.why).toContain(`w2 is ${bad}`);
    expect(head(f)).toBe(before);
  }
});

t("merge: two succeeded workers land on the run's branch and their folders go", () => {
  const f = fixture();
  setup(f, "succeeded", { w1: ["src/left/l.txt", "left"], w2: ["src/right/r.txt", "right"] });
  const r = merge(f.project, f.id);
  expect(r.ok).toBe(true);
  expect(readFileSync(join(f.wt, "src/left/l.txt"), "utf8")).toBe("left");
  expect(readFileSync(join(f.wt, "src/right/r.txt"), "utf8")).toBe("right");
  const w = readWorkers(f.project, f.id)!;
  expect([w.merge?.status, ...w.workers.map((x) => x.status)]).toEqual(["merged", "merged", "merged"]);
  expect(existsSync(w.workers[0]!.worktree)).toBe(false);
  expect(g(f.project, "branch", "--list", w.workers[0]!.branch)).toBe("");
});

t("G-05 a conflict leaves the run's branch where it was, marks it, names the files and sets the blocker", () => {
  const f = fixture();
  setup(f, "succeeded", { w1: ["a.txt", "one\nLEFT\nthree\n"], w2: ["src/right/f.txt", "RIGHT"] });
  // the run's own branch moved on and now clashes with w2's file
  mkdirSync(join(f.wt, "src", "right"), { recursive: true });
  writeFileSync(join(f.wt, "src", "right", "f.txt"), "RUN"); g(f.wt, "add", "."); g(f.wt, "commit", "-qm", "run");
  const before = head(f), r = merge(f.project, f.id);
  expect(r.ok).toBe(false);
  expect(head(f)).toBe(before);
  expect(g(f.wt, "status", "--porcelain")).toBe("");
  const w = readWorkers(f.project, f.id)!;
  expect(w.workers[1]!.status).toBe("conflict");
  expect(w.merge).toMatchObject({ status: "conflict", sha0: before, conflicts: ["src/right/f.txt"] });
  expect(readReport(join(f.project, ".kaizen"), f.id)?.blocked?.question).toContain("src/right/f.txt");
  expect(readFileSync(new URL("./workers.ts", import.meta.url), "utf8")).not.toMatch(/"-X|--strategy|"-s"/);
});

t("G-06 settings changed after init do not reach the run; the cap holds", () => {
  const f = fixture();
  init(f.project, f.id);
  mkdirSync(join(f.project, ".kaizen"), { recursive: true });
  writeFileSync(join(f.project, ".kaizen", "config.yml"), "orchestration:\n  enabled: false\n  max_workers: 1\n  permissions: bypass\n");
  setRun(f.project, f.id, "off") ?? null; // refused: it has workers
  expect(statusText(f.project, f.id)).toContain("max 3 · permissions own · model inherit (frozen)");
  // a hand-edited file with a fourth worker: the fourth start is refused
  const w = readWorkers(f.project, f.id)!;
  for (const id of ["w3", "w4"]) w.workers.push({ ...w.workers[0]!, id, status: "planned", after: [] });
  w.workers[0]!.status = w.workers[1]!.status = w.workers[2]!.status = "running";
  writeFileSync(join(f.dir, "workers.json"), JSON.stringify(w));
  const r = requestStart(f.project, f.id, "w4", 100);
  expect(r.ok).toBe(false);
  expect(r.why).toContain("most allowed is 3");
  expect(readWorkers(f.project, f.id)!.workers[3]!.status).toBe("planned");
});

t("G-07 overlapping ownership and an unrecorded approval are refused", () => {
  const o = fixture({ plan: "## Workers\n- w1 — a — owns: src\n- w2 — b — owns: src/deep/file.ts\n" });
  const r = init(o.project, o.id);
  expect(!r.ok && r.why).toContain("both own");
  expect(existsSync(join(o.dir, "workers.json"))).toBe(false);
  const u = fixture({ approved: false });
  const r2 = init(u.project, u.id);
  expect(!r2.ok && r2.why).toContain("approved");
  expect(existsSync(join(u.dir, "workers.json"))).toBe(false);
  const m = fixture({ plan: "## Workers\n- x1 — a — owns: a\n- w2 — b — owns: b\n" });
  expect(init(m.project, m.id).ok).toBe(false);
  const big = fixture({ plan: "## Workers\n- w1 — a — owns: a\n- w2 — b — owns: b\n- w3 — c — owns: c\n- w4 — d — owns: d\n" });
  const r4 = init(big.project, big.id);
  expect(!r4.ok && r4.why).toContain("most allowed is 3");
});

t("G-08 start times out cleanly with no board and puts the worker back to planned; only the board scan starts workers", () => {
  const f = fixture();
  init(f.project, f.id);
  const r = requestStart(f.project, f.id, "w1", 400);
  expect(r).toEqual({ ok: false, why: "the board did not start it: is `kaizen web` running?" });
  expect(readWorkers(f.project, f.id)!.workers[0]!.status).toBe("planned");
  expect(requested(f.project)).toEqual([]);
  const web = readFileSync(new URL("./web.ts", import.meta.url), "utf8");
  expect(web.match(/startWorker\(/g)?.length).toBe(1);
  const cli = readFileSync(new URL("./workers.ts", import.meta.url), "utf8");
  expect(cli).not.toContain("startPty");
});

t("G-09 done refuses a dirty worktree; cleanup uses branch -d, never -D", () => {
  const f = fixture();
  setup(f, "running");
  const x = readWorkers(f.project, f.id)!.workers[0]!;
  writeFileSync(join(x.worktree, "new.txt"), "x");
  const why = report(f.project, f.id, "w1", "done", { outcome: "succeeded", summary: "done" });
  expect(why).toContain("commit first");
  g(x.worktree, "add", "."); g(x.worktree, "commit", "-qm", "w1");
  expect(report(f.project, f.id, "w1", "done", { outcome: "bogus", summary: "x" })).toContain("succeeded or failed");
  expect(report(f.project, f.id, "w1", "done", { outcome: "succeeded", summary: "done" })).toBeNull();
  expect(readWorkers(f.project, f.id)!.workers[0]!.status).toBe("succeeded");
  const src = readFileSync(new URL("./workers.ts", import.meta.url), "utf8");
  expect(src).toContain('"branch", "-d"');
  expect(src).not.toContain('"-D"');
});

t("G-10 a blocked worker lights the run's existing blocker signal", () => {
  const f = fixture();
  setup(f, "running");
  expect(report(f.project, f.id, "w2", "blocked", { text: "which table?" })).toBeNull();
  const st = join(f.project, ".kaizen"), rep = readReport(st, f.id);
  expect(rep?.blocked?.question).toBe("w2: which table?");
  expect(signalOf({ stage: "build" }, rep, undefined, Date.now(), 5)).toBe("blocked");
  expect(report(f.project, f.id, "w2", "unblock")).toBeNull();
  expect(readReport(st, f.id)?.blocked).toBeUndefined();
});

t("worker model: the run's own agent's name, frozen at init; empty keeps the line; a tool with no model flag ignores it and says so", () => {
  const f = fixture();
  const cfg = join(f.project, ".kaizen", "config.yml");
  writeFileSync(cfg, "orchestration:\n  worker_model:\n    claude: haiku\n    cursor: whatever\n    codex: gpt-x\n");
  expect(resolve(f.project, f.id).model).toBe("haiku"); // claude is this run's agent, not codex
  init(f.project, f.id);
  writeFileSync(cfg, "orchestration:\n  worker_model:\n    claude: opus\n");
  expect(readWorkers(f.project, f.id)!.frozen.model).toBe("haiku");
  expect(statusText(f.project, f.id)).toContain("model haiku (frozen)");
  expect(resolve(f.project, f.id).model).toBe("opus");
  writeFileSync(cfg, "orchestration:\n  worker_model:\n    claude: not a model\n");
  expect(resolve(f.project, f.id).model).toBe("");
  writeFileSync(cfg, "orchestration:\n  worker_model:\n    claude: \"\"\n");
  expect(resolve(f.project, f.id).model).toBe("");

  const prefs = join(f.project, "agents.json");
  writeFileSync(prefs, JSON.stringify({ agents: { claude: { command: "/bin/sh" }, cursor: { command: "/bin/sh" } } }));
  process.env.KAIZEN_AGENT_PREFS = prefs;
  try {
    const x = readWorkers(f.project, f.id)!.workers[0]!;
    const go = (pick: string) => { const l = launchOf(f.project, f.id, x, "own", undefined, pick); if (typeof l === "string") throw new Error(l); return l; };
    const inh = go("");
    expect(inh.argv).not.toContain("--model");
    expect(inh.model).toBeUndefined();
    const pick = go("sonnet");
    expect(pick.argv.slice(pick.argv.indexOf("--model"), pick.argv.indexOf("--model") + 2)).toEqual(["--model", "sonnet"]);
    expect([pick.model, pick.modelNote]).toEqual(["sonnet", undefined]);
    const st = JSON.parse(readFileSync(join(f.dir, "state.json"), "utf8"));
    writeFileSync(join(f.dir, "state.json"), JSON.stringify({ ...st, agent: "cursor" }));
    const none = launchOf(f.project, f.id, x, "own", undefined, "haiku");
    if (typeof none === "string") throw new Error(none);
    expect(none.argv).not.toContain("--model");
    expect(none.model).toBeUndefined();
    expect(none.modelNote).toContain("takes no model flag");
  } finally { delete process.env.KAIZEN_AGENT_PREFS; }
});

t("fix 1: a worker with after: branches off the worker it follows and sees its code", () => {
  const f = fixture({ plan: "## Workers\n- w1 — left — owns: src/left\n- w2 — right — owns: src/right — after: w1\n" });
  expect(init(f.project, f.id)).toEqual({ ok: true, n: 2 });
  const w = readWorkers(f.project, f.id)!, [a, b] = w.workers as [typeof w.workers[0], typeof w.workers[0]];
  g(f.project, "worktree", "add", "-q", "-b", a.branch, a.worktree, f.branch);
  mkdirSync(join(a.worktree, "src"), { recursive: true });
  writeFileSync(join(a.worktree, "src", "left"), "L"); g(a.worktree, "add", "."); g(a.worktree, "commit", "-qm", "w1");
  a.status = "succeeded"; b.status = "requested"; b.requestedAt = Date.now();
  writeFileSync(join(f.dir, "workers.json"), JSON.stringify(w));
  const r = startWorker(f.project, f.id, "w2");
  expect(r.ok).toBe(true);
  expect(readFileSync(join(b.worktree, "src", "left"), "utf8")).toBe("L");
  // its own commit on top merges cleanly, and w1's code is not counted as w2's stray paths
  mkdirSync(join(b.worktree, "src"), { recursive: true });
  writeFileSync(join(b.worktree, "src", "right"), "R"); g(b.worktree, "add", "."); g(b.worktree, "commit", "-qm", "w2");
  b.status = "succeeded";
  writeFileSync(join(f.dir, "workers.json"), JSON.stringify(w));
  expect(merge(f.project, f.id).ok).toBe(true);
  expect(readFileSync(join(f.wt, "src", "right"), "utf8")).toBe("R");
});

t("fix 2: a stale request is not started by the board", () => {
  const f = fixture();
  init(f.project, f.id);
  const w = readWorkers(f.project, f.id)!;
  w.workers[0]!.status = "requested"; w.workers[0]!.requestedAt = Date.now() - 3_600_000;
  writeFileSync(join(f.dir, "workers.json"), JSON.stringify(w));
  expect(requested(f.project)).toEqual([]);
  const r = startWorker(f.project, f.id, "w1");
  expect(!r.ok && r.why).toContain("stale");
  expect(existsSync(w.workers[0]!.worktree)).toBe(false);
});

t("fix 3: merge refuses a branch that changed paths it does not own", () => {
  const f = fixture();
  setup(f, "succeeded", { w1: ["src/left", "l"], w2: ["elsewhere.txt", "x"] });
  const before = head(f), r = merge(f.project, f.id);
  expect(!r.ok && r.why).toContain("w2 changed paths it does not own (elsewhere.txt)");
  expect(head(f)).toBe(before);
});

t("fix 4: setRun writes state.json whole, with no temp file left", () => {
  const f = fixture();
  expect(setRun(f.project, f.id, "off")).toBeNull();
  expect(JSON.parse(readFileSync(join(f.dir, "state.json"), "utf8")).orchestration).toBe("off");
  expect(readdirSync(f.dir).filter((n) => n.endsWith(".tmp"))).toEqual([]);
});

t("fix 5: merge says what cleanup left behind", () => {
  const f = fixture();
  setup(f, "succeeded", { w1: ["src/left", "l"], w2: ["src/right", "r"] });
  const x = readWorkers(f.project, f.id)!.workers[0]!;
  writeFileSync(join(x.worktree, "untracked.txt"), "u");
  const r = merge(f.project, f.id);
  expect(r.ok && r.left.length).toBe(2);
  expect(r.ok && r.left.join("\n")).toContain("w1 folder");
  expect(r.ok && r.left.join("\n")).toContain("w1 branch");
  expect(existsSync(x.worktree)).toBe(true);
});

test("a live worker gone quiet reads stale; a busy, asking or done one does not", () => {
  const run = { status: "running" }, old = { alive: true, lastOut: 0 }, t = 11 * 60_000;
  expect(workerStale(run, old, t, 5)).toBe(true);
  expect(workerStale(run, { ...old, busy: true }, t, 5)).toBe(false);
  expect(workerStale(run, { ...old, asking: true }, t, 5)).toBe(false);
  expect(workerStale(run, { alive: true, lastOut: t - 60_000 }, t, 5)).toBe(false);
  expect(workerStale({ status: "succeeded" }, old, t, 5)).toBe(false);
  expect(workerStale(run, null, t, 5)).toBe(false);
});
