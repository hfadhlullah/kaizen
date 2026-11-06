// `kaizen preflight` (cli/preflight.ts): the look at the repo before a land. Real git repos in
// scratch (a bare remote and clones, as in worktree.test.ts); gh is a fake that only answers.
import { test, expect, beforeEach } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { preflight, report } from "./preflight.ts";
import { run, runAsync, startWorktree, type AsyncRun } from "./worktree.ts";

const ID = "2026-11-06-demo", OTHER = "2026-11-06-other";
let root: string, remote: string, project: string, other: string, wt: string;
const g = (cwd: string, ...a: string[]) => { const r = run(["git", "-c", "user.email=a@b.c", "-c", "user.name=t", ...a], cwd); if (!r.ok) throw new Error(r.why); return r.out; };
const commit = (cwd: string, f: string, text: string) => { mkdirSync(join(cwd, f, ".."), { recursive: true }); writeFileSync(join(cwd, f), text); g(cwd, "add", f); g(cwd, "commit", "-qm", `feat: ${f}`); };
const mkRun = (id: string, state: object = { stage: "build" }) => {
  mkdirSync(join(project, ".kaizen", "runs", id), { recursive: true });
  writeFileSync(join(project, ".kaizen", "runs", id, "state.json"), JSON.stringify({ id, ...state }));
};
const refs = () => g(project, "ls-remote", remote);
// gh that answers from a table and logs what it was asked; git goes to the real one.
const fakeGh = (answers: { view?: object | null; runs?: object[]; prs?: object[] }) => {
  const log: string[][] = [];
  const ash: AsyncRun = async (cmd, cwd) => {
    if (cmd[0] !== "gh") return runAsync(cmd, cwd);
    log.push(cmd);
    const k = cmd.slice(1, 3).join(" ");
    const v = k === "pr view" ? answers.view : k === "run list" ? answers.runs ?? [] : k === "pr list" ? answers.prs ?? [] : null;
    return v === null || v === undefined ? { ok: false, out: "", why: "no pull requests found" } : { ok: true, out: JSON.stringify(v), why: "" };
  };
  return { ash, log };
};

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "kz-pf-")));
  remote = join(root, "remote.git"); project = join(root, "project"); other = join(root, "other");
  g(root, "init", "-q", "--bare", "-b", "main", remote);
  g(root, "clone", "-q", remote, project);
  commit(project, "a.txt", "a"); g(project, "push", "-q", "origin", "HEAD:main");
  g(root, "clone", "-q", remote, other);
  writeFileSync(join(project, ".gitignore"), ".kaizen/*\n");
  mkRun(ID);
  const w = startWorktree(project, ID);
  if (!w.ok) throw new Error(w.why);
  wt = w.path;
  commit(wt, "x.txt", "mine");
});

test("G-02 clean: up to date, nothing else touches these files", async () => {
  const p = await preflight(project, ID, { hasGh: false });
  expect(p.clean).toBe(true);
  expect(p.files).toEqual(["x.txt"]);
  expect(p.notes.join(" ")).toContain("not checked: needs gh");
  expect(report(p)).toStartWith(`clean: kaizen/${ID} → main`);
});

test("G-03 behind its base stops it", async () => {
  commit(other, "b.txt", "b"); g(other, "push", "-q", "origin", "HEAD:main");
  const p = await preflight(project, ID, { hasGh: false });
  expect(p.clean).toBe(false);
  expect(p.issues.map((i) => i.kind)).toEqual(["behind"]);
  expect(p.issues[0]!.what).toContain("1 commit behind origin/main");
});

test("G-03 an unmerged branch changing the same file stops it; a merged one and a disjoint one do not", async () => {
  g(other, "checkout", "-qb", "feat/same"); commit(other, "x.txt", "theirs"); g(other, "push", "-q", "origin", "feat/same");
  g(other, "checkout", "-q", "main"); g(other, "checkout", "-qb", "feat/apart"); commit(other, "y.txt", "y"); g(other, "push", "-q", "origin", "feat/apart");
  g(other, "checkout", "-q", "main"); g(other, "push", "-q", "origin", "main:feat/merged"); // nothing of its own
  const p = await preflight(project, ID, { hasGh: false });
  expect(p.issues).toEqual([{ kind: "branch-overlap", what: "feat/same (not merged) also changes 1 of these files", files: ["x.txt"] }]);
});

test("G-03 another run in flight with its own worktree on the same file stops it", async () => {
  mkRun(OTHER);
  const o = startWorktree(project, OTHER);
  if (!o.ok) throw new Error(o.why);
  commit(o.path, "x.txt", "the other run");
  let p = await preflight(project, ID, { hasGh: false });
  expect(p.issues.map((i) => [i.kind, i.what.split(" ")[0]])).toEqual([["branch-overlap", `kaizen/${OTHER}`]]);
  // Once that run is done it no longer counts (its branch is local only).
  mkRun(OTHER, { stage: "done", worktree: o.path, branch: `kaizen/${OTHER}` });
  p = await preflight(project, ID, { hasGh: false });
  expect(p.clean).toBe(true);
});

test("G-07 overlap only in git.generated files is a note, not a stop", async () => {
  mkdirSync(join(project, ".kaizen"), { recursive: true });
  writeFileSync(join(project, ".kaizen", "config.yml"), 'git:\n  generated: "web/*.js"\n');
  commit(wt, "web/board.js", "mine");
  g(other, "checkout", "-qb", "feat/ui"); commit(other, "web/board.js", "theirs"); g(other, "push", "-q", "origin", "feat/ui");
  const p = await preflight(project, ID, { hasGh: false });
  expect(p.clean).toBe(true);
  expect(p.notes.join(" ")).toContain("generated files (web/board.js)");
});

test("G-03 with gh: failed and running CI, a failed base, and an overlapping open PR each stop it", async () => {
  const pr = (rollup: object[]) => ({ number: 7, statusCheckRollup: rollup });
  const kinds = async (a: Parameters<typeof fakeGh>[0]) => (await preflight(project, ID, { hasGh: true, ash: fakeGh(a).ash })).issues.map((i) => i.kind);
  expect(await kinds({ view: pr([{ status: "COMPLETED", conclusion: "SUCCESS" }]) })).toEqual([]);
  expect(await kinds({ view: pr([{ status: "COMPLETED", conclusion: "FAILURE" }]) })).toEqual(["ci-failed"]);
  expect(await kinds({ view: pr([{ status: "IN_PROGRESS", conclusion: "" }]) })).toEqual(["ci-running"]);
  expect(await kinds({ view: pr([]), runs: [{ status: "completed", conclusion: "failure" }] })).toEqual(["base-failed"]);
  // An open PR on the same file: reported once, as the PR, not again as its branch.
  g(other, "checkout", "-qb", "feat/pr"); commit(other, "x.txt", "pr"); g(other, "push", "-q", "origin", "feat/pr");
  const prs = [{ number: 9, title: "the other PR", headRefName: "feat/pr", files: [{ path: "x.txt" }] }, { number: 10, title: "apart", headRefName: "feat/apart", files: [{ path: "z.txt" }] }, { number: 11, title: "mine", headRefName: `kaizen/${ID}`, files: [{ path: "x.txt" }] }];
  const p = await preflight(project, ID, { hasGh: true, ash: fakeGh({ view: pr([]), prs }).ash });
  expect(p.issues.map((i) => i.what)).toEqual(["#9 feat/pr (the other PR) also changes 1 of these files"]);
});

test("G-04 the check only asks: no ref moves, gh is only read", async () => {
  g(other, "checkout", "-qb", "feat/same"); commit(other, "x.txt", "theirs"); g(other, "push", "-q", "origin", "feat/same");
  const before = refs(), head = g(wt, "rev-parse", "HEAD"), f = fakeGh({ view: { number: 7, statusCheckRollup: [{ status: "COMPLETED", conclusion: "FAILURE" }] } });
  const p = await preflight(project, ID, { hasGh: true, ash: f.ash });
  expect(p.clean).toBe(false);
  expect(refs()).toBe(before);
  expect(g(wt, "rev-parse", "HEAD")).toBe(head);
  expect([...new Set(f.log.map((c) => c.slice(1, 3).join(" ")))].sort()).toEqual(["pr list", "pr view", "run list"]);
});

test("G-05 no remote, no gh, or offline never stops it", async () => {
  // No remote: a local-only project.
  const lone = join(root, "lone");
  g(root, "init", "-q", "-b", "main", lone); commit(lone, "a.txt", "a");
  mkdirSync(join(lone, ".kaizen", "runs", ID), { recursive: true });
  writeFileSync(join(lone, ".kaizen", "runs", ID, "state.json"), JSON.stringify({ id: ID, stage: "build" }));
  const p = await preflight(lone, ID, { hasGh: true });
  expect(p).toMatchObject({ clean: true, notes: ["no remote: nothing to compare"] });
  // Offline: the remote is gone; it compares with the last fetch and says so.
  g(project, "remote", "set-url", "origin", join(root, "gone.git"));
  const q = await preflight(project, ID, { hasGh: false });
  expect(q.clean).toBe(true);
  expect(q.notes[0]).toBe("offline: compared with the last fetch");
  // gh that answers nothing (logged out): notes, still clean.
  const r = await preflight(project, ID, { hasGh: true, ash: async (cmd, cwd) => (cmd[0] === "gh" ? { ok: false, out: "", why: "not logged in" } : runAsync(cmd, cwd)) });
  expect(r.clean).toBe(true);
  expect(r.notes.join(" ")).toContain("not logged in");
});

// The CLI: `kaizen worktree land` stops (exit 2, nothing pushed) and goes on only with --checked.
const cli = (args: string[]) => {
  const p = Bun.spawnSync([process.execPath, join(import.meta.dir, "install.ts"), ...args], {
    cwd: project, stdin: "ignore",
    env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "a@b.c", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "a@b.c", HOME: root, USERPROFILE: root, KAIZEN_TERM: "" },
  });
  return { code: p.exitCode, out: p.stdout.toString() + p.stderr.toString() };
};

test("G-01 G-06 G-08 worktree land stops on an overlap, records it, and lands only with --checked", () => {
  g(other, "checkout", "-qb", "feat/same"); commit(other, "x.txt", "theirs"); g(other, "push", "-q", "origin", "feat/same");
  const before = refs();
  expect(cli(["preflight", ID]).code).toBe(2);
  const r = cli(["worktree", "land", ID]);
  expect(r.code).toBe(2);
  expect(r.out).toContain("feat/same (not merged) also changes 1 of these files");
  expect(r.out).toContain(`kaizen worktree land ${ID} --checked`);
  expect(refs()).toBe(before);
  const log = readFileSync(join(project, ".kaizen", "runs", ID, "preflight.md"), "utf8");
  expect(log.match(/decision: stopped/g)?.length).toBe(2);
  const ok = cli(["worktree", "land", ID, "--checked"]);
  expect(ok.code).toBe(0);
  expect(g(project, "ls-tree", "--name-only", "origin/main").split("\n")).toContain("x.txt");
  expect(readFileSync(join(project, ".kaizen", "runs", ID, "preflight.md"), "utf8")).toContain("decision: go ahead (user)");
});

test("G-02 worktree land on a clean repo lands as before and records clean", () => {
  const r = cli(["worktree", "land", ID]);
  expect(r.code).toBe(0);
  expect(readFileSync(join(project, ".kaizen", "runs", ID, "preflight.md"), "utf8")).toContain("decision: clean");
});

// The board: a stopped Create PR comes back 409 with what was found and a one-time token.
test.skipIf(process.platform === "win32")("G-01 G-06 board Create PR stops on an overlap and goes on only with its one-time token", async () => {
  g(other, "checkout", "-qb", "feat/same"); commit(other, "x.txt", "theirs"); g(other, "push", "-q", "origin", "feat/same");
  mkRun(ID, { stage: "done", worktree: wt, branch: `kaizen/${ID}` });
  writeFileSync(join(project, ".kaizen", "runs", ID, "03-impl.md"), "## Changed\n- `x.txt`\n");
  // A second run with no worktree: its Commit & push goes to main itself.
  mkRun(OTHER, { stage: "done" });
  writeFileSync(join(project, ".kaizen", "runs", OTHER, "03-impl.md"), "## Changed\n- `x.txt`\n");
  writeFileSync(join(project, "x.txt"), "straight onto main");
  mkdirSync(join(root, ".kaizen"), { recursive: true });
  mkdirSync(join(root, ".claude"), { recursive: true });
  writeFileSync(join(root, ".kaizen", "projects"), project + "\n");
  const port = 20000 + Math.floor(Math.random() * 20000);
  const p = Bun.spawn([process.execPath, join(import.meta.dir, "install.ts"), "web", "--foreground", "--no-open", "--port", String(port)],
    { env: { ...process.env, HOME: root, USERPROFILE: root, KAIZEN_HOME: join(root, "kz") }, stdout: "ignore", stderr: "ignore" });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base + "/")).ok) break; } catch { /* not up yet */ } await Bun.sleep(100); }
    const pr = async (extra: object = {}) => {
      const r = await fetch(base + "/pr", { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify({ dir: join(project, ".kaizen"), id: ID, op: "create", title: "feat: x", ...extra }) });
      return { status: r.status, body: (await r.json()) as any };
    };
    const first = await pr();
    expect(first.status).toBe(409);
    expect(first.body.preflight.issues[0].kind).toBe("branch-overlap");
    expect((await pr({ override: "made-up" })).body.preflight).toBeDefined(); // a made-up token: checked again, stopped again
    const again = await pr();
    const passed = await pr({ override: again.body.token });
    expect(passed.body.preflight).toBeUndefined(); // past the check; openPr then needs gh, which this remote is not
    expect(JSON.stringify(passed.body)).toContain("GitHub");
    expect((await pr({ override: again.body.token })).body.preflight).toBeDefined(); // spent
    expect(existsSync(join(project, ".kaizen", "runs", ID, "preflight.md"))).toBe(true);
    // Merge PR: the same stop.
    const merge = await pr({ op: "merge" });
    expect(merge.status).toBe(409);
    expect(merge.body.preflight.issues[0].kind).toBe("branch-overlap");
    // Commit & push of the no-worktree run: stopped before anything is committed or pushed.
    const before = refs(), head = g(project, "rev-parse", "HEAD");
    const push = await fetch(base + "/commit", { method: "POST", headers: { origin: base, "content-type": "application/json" }, body: JSON.stringify({ dir: join(project, ".kaizen"), id: OTHER, message: "feat: x", files: ["x.txt"] }) });
    const pushed = (await push.json()) as any;
    expect(push.status).toBe(409);
    expect(pushed.preflight.issues.map((i: any) => i.kind)).toContain("branch-overlap");
    expect(refs()).toBe(before);
    expect(g(project, "rev-parse", "HEAD")).toBe(head);
  } finally { p.kill(); }
}, 30000);

test("G-01 a run with no worktree: its uncommitted files count, so Commit & push on the base is checked", async () => {
  g(other, "checkout", "-qb", "feat/same"); commit(other, "app.ts", "theirs"); g(other, "push", "-q", "origin", "feat/same");
  mkRun(OTHER, { stage: "done" });
  writeFileSync(join(project, ".kaizen", "runs", OTHER, "03-impl.md"), "## Changed\n- `app.ts`\n");
  writeFileSync(join(project, "app.ts"), "mine, not committed yet");
  const p = await preflight(project, OTHER, { hasGh: false });
  expect(p.branch).toBe("main");
  expect(p.files).toContain("app.ts");
  expect(p.issues.map((i) => i.what)).toContain("feat/same (not merged) also changes 1 of these files");
  expect(cli(["preflight", OTHER]).code).toBe(2);
});
