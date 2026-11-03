// kaizen stats / related (cli/stats.ts) and the stages.log that kaizen state writes.
import { test, expect, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { allStats, summary, stageTimes, tokensIn, runTokens, related } from "./stats.ts";

const script = join(dirname(import.meta.path), "install.ts");
const roots: string[] = [];
afterAll(() => roots.forEach((r) => rmSync(r, { recursive: true, force: true })));

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "kz-stats-")); roots.push(root);
  const project = join(root, "p"), state = join(project, ".kaizen"), home = join(root, "home");
  mkdirSync(home);
  const run = (id: string, s: object, files: Record<string, string>) => {
    const d = join(state, "runs", id);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "state.json"), JSON.stringify({ id, mode: "approve", runner: "lite", agent: "claude", ...s }));
    for (const [f, t] of Object.entries(files)) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), t); }
  };
  mkdirSync(join(project, "src"), { recursive: true });
  writeFileSync(join(project, "src", "a.ts"), ""); writeFileSync(join(project, "src", "b.ts"), "");
  run("r1-fixed", { stage: "done", track: "software" }, { "00-request.md": "Fix the a file\n", "03-impl.md": "## What changed\n- `src/a.ts` — x\n", "04-review.md": "# Findings\n1. high — x\n", "05-iterations/01-fix.md": "x", "06-backlog.md": "- open: later\n" });
  run("r2-unverified", { stage: "done", track: "code" }, { "00-request.md": "Touch b\n", "03-impl.md": "## What changed\n- `src/b.ts` — y\n", "04-review.md": "## Acceptance\nG-01 CANNOT VERIFY: needs a phone\n" });
  run("r3-abandoned", { stage: "abandoned", track: "writing" }, { "00-request.md": "x\n" });
  run("r4-unreviewed", { stage: "build", track: "code: ci flake" }, { "00-request.md": "y\n", "03-impl.md": "## What changed\n- `src/a.ts` — z\n" });
  const kz = (...a: string[]) => {
    const p = Bun.spawnSync([process.execPath, script, ...a], { cwd: project, env: { PATH: process.env.PATH ?? "", HOME: home, USERPROFILE: home } });
    return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() };
  };
  return { project, state, home, kz };
}

test("summary counts reviewed, fixed and CANNOT VERIFY runs exactly, with tracks mapped", () => {
  const f = fixture(), s = summary(allStats(f.state));
  expect(s).toMatchObject({ runs: 4, reviewed: 2, fixed: 1, unverified: 1 });
  expect(s.stage).toEqual({ done: 2, abandoned: 1, build: 1 });
  expect(s.track).toEqual({ code: 3, writing: 1 });
});

test("stage times charge each interval to the state at its start; no log means no times", () => {
  const t0 = Date.parse("2026-11-03T10:00:00Z");
  const log = ["2026-11-03T10:05:00Z plan approvals.plan", "2026-11-03T10:20:00Z build -", "2026-11-03T10:50:00Z review -",
    "2026-11-03T10:55:00Z build -", "2026-11-03T11:00:00Z review approvals.review", "2026-11-03T11:30:00Z done -"].join("\n");
  const m = 60_000;
  expect(stageTimes(log, t0)).toEqual({ plan: 5 * m, wait: 45 * m, build: 35 * m, review: 5 * m });
  expect(stageTimes("", t0)).toEqual({ plan: null, wait: null, build: null, review: null });
  // A log that starts at review: the gap before it is unknown, not planning.
  expect(stageTimes("2026-11-03T10:50:00Z review -\n2026-11-03T11:00:00Z done -", t0)).toEqual({ plan: null, wait: null, build: null, review: 10 * m });
});

test("kaizen state and kaizen done append to stages.log", () => {
  const f = fixture();
  expect(f.kz("state", "r4-unreviewed", "stage=review", "awaiting=approvals.review").code).toBe(0);
  expect(f.kz("state", "r4-unreviewed", "iteration=2").code).toBe(0);   // no stage change: no line
  const lines = readFileSync(join(f.state, "runs", "r4-unreviewed", "stages.log"), "utf8").trim().split("\n");
  expect(lines.length).toBe(1);
  expect(lines[0]).toMatch(/^\d{4}-\d\d-\d\dT\S+ review approvals\.review$/);
});

test("tokens count only lines inside the run's window; no session or log is n/a", () => {
  const f = fixture();
  const log = join(f.home, ".claude", "projects", "-p", "sess-1.jsonl");
  mkdirSync(dirname(log), { recursive: true });
  const line = (at: string, out: number) => JSON.stringify({ timestamp: at, message: { usage: { input_tokens: 10, output_tokens: out, cache_read_input_tokens: 100 } } });
  writeFileSync(log, [line("2026-11-03T09:00:00Z", 1), line("2026-11-03T10:30:00Z", 7), line("2026-11-03T12:00:00Z", 1000), "not json"].join("\n"));
  const t = tokensIn(log, Date.parse("2026-11-03T10:00:00Z"), Date.parse("2026-11-03T11:00:00Z"));
  expect(t).toEqual({ input: 10, output: 7, cacheRead: 100, cacheWrite: 0, turns: 1 });
  expect(runTokens(f.state, "r1-fixed", f.home)).toBeNull();   // no session key
  writeFileSync(join(f.state, "runs", "r2-unverified", "state.json"), JSON.stringify({ id: "r2-unverified", stage: "done", agent: "claude", session: "missing", updated: "2026-11-03T11:00:00Z" }));
  expect(runTokens(f.state, "r2-unverified", f.home)).toBeNull();   // no log file
  expect(f.kz("stats", "r1-fixed").out).toContain("tokens: n/a");
});

test("related lists runs that changed the path, newest first, with open backlog", () => {
  const f = fixture();
  expect(related(f.state, ["src/a.ts"]).map((r) => r.id)).toEqual(["r4-unreviewed", "r1-fixed"]);
  expect(related(f.state, ["./src/b.ts"])[0]).toEqual({ id: "r2-unverified", title: "Touch b", open: 0 });
  expect(related(f.state, ["src/a.ts"])[1]!.open).toBe(1);
  expect(f.kz("related", "nothing.ts").out.trim()).toBe("Related: none");
});

test("stats and related write nothing under runs/", () => {
  const f = fixture(), runs = join(f.state, "runs");
  const snap = () => readdirSync(runs, { recursive: true }).map(String).sort().map((p) => `${p}@${statSync(join(runs, p)).mtimeMs}`).join("\n");
  const before = snap();
  f.kz("stats"); f.kz("stats", "--json"); f.kz("stats", "r1-fixed"); f.kz("related", "src/a.ts");
  expect(snap()).toBe(before);
});
