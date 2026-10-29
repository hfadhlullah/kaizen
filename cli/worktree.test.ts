// A real bare remote, two clones and real git: the landing is only as good as git says.
import { test, expect, beforeEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startWorktree, landWorktree, codeDir, projectFromWorktree, run, runAsync, workspaces, workspacesNow, addWorktree, wsOf, adoptWorkspace, branchState, openPr, mergePr, removeWorktree, type Run, type AsyncRun } from "./worktree.ts";

const ID = "2026-10-17-demo";
// CI runners have no git identity, and landWorktree's rebase writes commits.
const idRun: Run = (cmd, cwd) => run(cmd[0] === "git" ? ["git", "-c", "user.email=a@b.c", "-c", "user.name=t", ...cmd.slice(1)] : cmd, cwd);
let remote: string, project: string, other: string;
const g = (cwd: string, ...a: string[]) => { const r = run(["git", "-c", "user.email=a@b.c", "-c", "user.name=t", ...a], cwd); if (!r.ok) throw new Error(r.why); return r.out; };
const commit = (cwd: string, f: string, text: string) => { writeFileSync(join(cwd, f), text); g(cwd, "add", f); g(cwd, "commit", "-qm", `feat: ${f}`); };
const state = () => JSON.parse(readFileSync(join(project, ".kaizen/runs", ID, "state.json"), "utf8"));

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "wt-"));
  remote = join(root, "remote.git"); project = join(root, "project"); other = join(root, "other");
  g(root, "init", "-q", "--bare", "-b", "main", remote);
  g(root, "clone", "-q", remote, project);
  commit(project, "a.txt", "a"); g(project, "push", "-q", "origin", "HEAD:main");
  g(root, "clone", "-q", remote, other);
  mkdirSync(join(project, ".kaizen/runs", ID), { recursive: true });
  writeFileSync(join(project, ".kaizen/runs", ID, "state.json"), JSON.stringify({ id: ID, stage: "build" }));
  writeFileSync(join(project, ".gitignore"), ".kaizen/*\n");
});

test("G-01 start leaves the project folder alone and records the worktree", () => {
  writeFileSync(join(project, "dirty.txt"), "someone else's edit");
  const head = g(project, "rev-parse", "HEAD"), br = g(project, "branch", "--show-current");
  const r = startWorktree(project, ID);
  expect(r.ok).toBe(true);
  expect(g(project, "rev-parse", "HEAD")).toBe(head);
  expect(g(project, "branch", "--show-current")).toBe(br);
  expect(readFileSync(join(project, "dirty.txt"), "utf8")).toBe("someone else's edit");
  expect(state().branch).toBe(`kaizen/${ID}`);
  expect(codeDir(project, ID)).toBe(state().worktree);
  expect(startWorktree(project, ID).ok).toBe(true); // a resume
});

test("G-06 a run id is a slug before it reaches a path or a branch", () => {
  expect(startWorktree(project, "../evil").ok).toBe(false);
  expect(startWorktree(project, "x; rm -rf").ok).toBe(false);
  expect(landWorktree(project, "../evil").ok).toBe(false);
});

test("G-02 lands by rebase and push after main moved on", () => {
  const w = (startWorktree(project, ID) as { path: string }).path;
  commit(w, "run.txt", "mine");
  commit(other, "theirs.txt", "x"); g(other, "push", "-q", "origin", "HEAD:main"); // main moves ahead
  const r = landWorktree(project, ID, idRun, false);
  expect(r).toEqual({ ok: true, how: "push", url: undefined });
  g(project, "fetch", "-q", "origin");
  expect(g(project, "ls-tree", "--name-only", "origin/main").split("\n")).toEqual(["a.txt", "run.txt", "theirs.txt"]);
  expect(existsSync(w)).toBe(false);                       // G-04: gone only after landing
  expect(state().worktree).toBeUndefined();
});

test("G-02 lands by pull request when gh is there", () => {
  const w = (startWorktree(project, ID) as { path: string }).path;
  commit(w, "run.txt", "mine");
  const calls: string[][] = [];
  const sh: Run = (cmd, cwd) => {
    if (cmd[0] !== "gh") return run(cmd, cwd);
    calls.push(cmd);
    if (cmd[2] === "create") return { ok: true, out: "https://github.com/x/y/pull/1", why: "" };
    // gh's rebase-merge, done by hand: the work reaches main under new hashes
    g(cwd, "fetch", "-q", "origin"); g(cwd, "rebase", "-q", "origin/main");
    g(cwd, "push", "-q", "origin", "HEAD:main");
    return { ok: true, out: "", why: "" };
  };
  commit(other, "theirs.txt", "x"); g(other, "push", "-q", "origin", "HEAD:main");
  const r = landWorktree(project, ID, sh, true);
  expect(r).toEqual({ ok: true, how: "pr", url: "https://github.com/x/y/pull/1" });
  expect(calls.map((c) => c.slice(0, 4).join(" "))).toEqual(["gh pr create --base", "gh pr merge kaizen/" + ID]);
  expect(existsSync(w)).toBe(false);
});

test("G-03 a conflict keeps the worktree and branch and says so", () => {
  const w = (startWorktree(project, ID) as { path: string }).path;
  commit(w, "a.txt", "mine");
  commit(other, "a.txt", "theirs"); g(other, "push", "-q", "origin", "HEAD:main");
  const r = landWorktree(project, ID, run, false);
  expect(r.ok).toBe(false);
  expect(existsSync(w)).toBe(true);
  expect(g(project, "branch", "--list", `kaizen/${ID}`)).toContain(ID);
  expect(g(w, "status", "--porcelain")).toBe("");          // rebase aborted, tree clean
});

test("G-03 a pull request that will not merge is left open", () => {
  const w = (startWorktree(project, ID) as { path: string }).path;
  commit(w, "run.txt", "mine");
  const sh: Run = (cmd, cwd) => cmd[0] !== "gh" ? run(cmd, cwd)
    : cmd[2] === "create" ? { ok: true, out: "url", why: "" } : { ok: false, out: "", why: "not mergeable" };
  const r = landWorktree(project, ID, sh, true);
  expect(r.ok).toBe(false);
  expect(existsSync(w)).toBe(true);
});

test("G-03 uncommitted work in the worktree is never landed or removed", () => {
  const w = (startWorktree(project, ID) as { path: string }).path;
  writeFileSync(join(w, "wip.txt"), "unsaved");
  expect(landWorktree(project, ID, run, false).ok).toBe(false);
  expect(existsSync(join(w, "wip.txt"))).toBe(true);
});

test("G-05 a run with no worktree has none to land and codeDir is the project", () => {
  expect(codeDir(project, ID)).toBe(project);
  expect(landWorktree(project, ID, run, false)).toEqual({ ok: false, why: "this run has no worktree" });
});

test("projectFromWorktree finds the project from inside a run's folder", () => {
  expect(projectFromWorktree("/p/.kaizen/wt/2026-10-17-x/cli")).toBe("/p");
  expect(projectFromWorktree("/p/cli")).toBe("/p/cli");
});

test("workspaces: the main checkout, then each worktree; a folder that is not git is one workspace", () => {
  expect(addWorktree(project, "-x", idRun).ok).toBe(false);
  expect(addWorktree(project, "bad..name", idRun)).toMatchObject({ ok: false });
  const r = addWorktree(project, "feat/two", idRun);
  expect(r.ok).toBe(true);
  expect(existsSync(join(project, ".kaizen/wt/feat-two"))).toBe(true);
  expect(addWorktree(project, "feat/two", idRun).ok).toBe(false); // folder exists
  const ws = workspaces(project, idRun);
  expect(ws[0]).toEqual({ path: project, branch: "main", main: true });
  expect(ws.slice(1)).toEqual([{ path: (r as any).path, branch: "feat/two", main: false }]);
  const plain = mkdtempSync(join(tmpdir(), "nogit-"));
  expect(workspaces(plain, idRun)).toEqual([{ path: plain, branch: "", main: true }]);
  // A run's workspace: its worktree while on disk, else the main checkout.
  expect(wsOf(project, { worktree: (r as any).path })).toBe((r as any).path);
  expect(wsOf(project, { worktree: join(project, ".kaizen/wt/gone") })).toBe(project);
  expect(wsOf(project, {})).toBe(project);
});

test("adoptWorkspace: a run started inside another workspace is placed there, with no worktree of its own", () => {
  const r = addWorktree(project, "feat/two", idRun) as { path: string };
  expect(adoptWorkspace(project, ID, project)).toBeNull(); // the main checkout: a normal start
  mkdirSync(join(r.path, "sub"));
  expect(adoptWorkspace(project, ID, join(r.path, "sub"))).toEqual({ ok: true, path: r.path });
  expect(state().workspace).toBe(r.path);
  expect(state().worktree).toBeUndefined(); // land must never remove a folder the user made
  expect(wsOf(project, state())).toBe(r.path);
  expect(codeDir(project, ID)).toBe(project);
});

test("workspacesNow: answers at once, refreshes git in the background, one call at a time", async () => {
  const p = mkdtempSync(join(tmpdir(), "wsnow-"));
  let calls = 0, done!: (o: { ok: boolean; out: string; why: string }) => void;
  const slow = () => { calls++; return new Promise<any>((r) => (done = r)); };
  expect(workspacesNow(p, slow)).toEqual([{ path: p, branch: "", main: true }]); // git still running
  expect(workspacesNow(p, slow)).toEqual([{ path: p, branch: "", main: true }]);
  expect(calls).toBe(1);
  done({ ok: true, out: `worktree ${p}\nHEAD abc\nbranch refs/heads/dev`, why: "" });
  await Bun.sleep(0);
  expect(workspacesNow(p, slow)).toEqual([{ path: p, branch: "dev", main: true }]);
  expect(calls).toBe(1);
});

// ---- the Git tab (2026-10-30-run-git-tab)

// gh faked, git real: GitHub is never asked, the branch and the worktree are real.
const fakeGh = (answer: (cmd: string[], cwd: string) => { ok: boolean; out: string; why: string }) => {
  const calls: string[][] = [];
  const ash: AsyncRun = async (cmd, cwd) => {
    if (cmd[0] !== "gh") return runAsync(cmd[0] === "git" ? ["git", "-c", "user.email=a@b.c", "-c", "user.name=t", ...cmd.slice(1)] : cmd, cwd);
    calls.push(cmd);
    return answer(cmd, cwd);
  };
  return { ash, calls };
};
const ghRun: Run = (cmd, cwd) => { if (cmd[0] === "gh") throw new Error("gh run on the request path"); return idRun(cmd, cwd); };
const tick = () => new Promise((r) => setTimeout(r, 50));

test("G-03 branchState never asks GitHub on the request path and shows the PR once the look lands", async () => {
  const id = "2026-10-30-look";
  mkdirSync(join(project, ".kaizen/runs", id), { recursive: true });
  writeFileSync(join(project, ".kaizen/runs", id, "state.json"), JSON.stringify({ id, stage: "done" }));
  startWorktree(project, id);
  const pr = { number: 7, url: "https://github.com/x/y/pull/7", state: "OPEN", isDraft: false };
  const { ash, calls } = fakeGh(() => ({ ok: true, out: JSON.stringify(pr), why: "" }));
  let changed = 0;
  const first = branchState(project, id, () => changed++, ghRun, ash, true)!;
  expect(first).toMatchObject({ branch: `kaizen/${id}`, base: "main", upstream: false, landed: false, pr: null, checking: true });
  await tick();
  expect(calls.map((c) => c.slice(0, 4).join(" "))).toEqual([`gh pr view kaizen/${id}`]);
  expect(changed).toBe(1);
  const again = branchState(project, id, () => changed++, ghRun, ash, true)!;
  expect(again.pr).toEqual({ number: 7, url: pr.url, state: "OPEN", draft: false });
  expect(again.checking).toBe(false);
  await tick();
  expect(calls.length).toBe(1); // cached: no second look inside 30 s
});

test("G-02 a run with no worktree has no branch state; one with no commits of its own is not landed", () => {
  expect(branchState(project, ID, () => {}, ghRun, runAsync, false)).toBeNull();
  startWorktree(project, ID);
  expect(branchState(project, ID, () => {}, ghRun, runAsync, false)!.landed).toBe(false);
});

test("G-06 openPr pushes, then creates the PR with title and body as separate arguments", async () => {
  const w = (startWorktree(project, ID) as { path: string }).path;
  commit(w, "run.txt", "mine");
  const { ash, calls } = fakeGh((cmd) => cmd[2] === "view"
    ? { ok: true, out: JSON.stringify({ number: 3, url: "u", state: "OPEN", isDraft: true }), why: "" }
    : { ok: true, out: "u", why: "" });
  const r = await openPr(project, ID, "feat: a; rm -rf /", "Run x.\n$(id)", true, idRun, ash, true);
  expect(r).toEqual({ ok: true, pr: { number: 3, url: "u", state: "OPEN", draft: true } });
  expect(calls[0]).toEqual(["gh", "pr", "create", "--base", "main", "--head", `kaizen/${ID}`, "--title", "feat: a; rm -rf /", "--body", "Run x.\n$(id)", "--draft"]);
  expect(g(project, "ls-remote", "--heads", "origin", `kaizen/${ID}`)).toContain(ID); // pushed first
});

test("G-06 openPr refuses a dirty worktree, no gh, an empty title, and a run without a branch", async () => {
  const { ash, calls } = fakeGh(() => ({ ok: true, out: "", why: "" }));
  expect((await openPr(project, ID, "t", "", false, idRun, ash, true)).ok).toBe(false); // no worktree
  const w = (startWorktree(project, ID) as { path: string }).path;
  expect((await openPr(project, ID, "t", "", false, idRun, ash, false)).ok).toBe(false);
  expect((await openPr(project, ID, "  ", "", false, idRun, ash, true)).ok).toBe(false);
  writeFileSync(join(w, "dirty.txt"), "x");
  const r = await openPr(project, ID, "t", "", false, idRun, ash, true);
  expect(r).toEqual({ ok: false, why: "Commit the changes first." });
  expect(calls).toEqual([]);
});

test("G-06 mergePr merges by rebase with the branch name", async () => {
  startWorktree(project, ID);
  const { ash, calls } = fakeGh(() => ({ ok: true, out: "", why: "" }));
  expect(await mergePr(project, ID, idRun, ash, true)).toEqual({ ok: true });
  expect(calls).toEqual([["gh", "pr", "merge", `kaizen/${ID}`, "--rebase"]]);
});

test("G-04 removeWorktree refuses dirty or unlanded work and cleans up once it is on the base", async () => {
  const w = (startWorktree(project, ID) as { path: string }).path;
  commit(w, "run.txt", "mine");
  writeFileSync(join(w, "wip.txt"), "x");
  expect((await removeWorktree(project, ID, idRun)).ok).toBe(false);
  g(w, "add", "wip.txt"); g(w, "commit", "-qm", "feat: wip");
  const unlanded = await removeWorktree(project, ID, idRun);
  expect(unlanded.ok).toBe(false);
  expect(existsSync(w)).toBe(true);
  // GitHub's rebase-merge, by hand: the work reaches main under new hashes.
  commit(other, "theirs.txt", "x"); g(other, "push", "-q", "origin", "HEAD:main");
  g(w, "fetch", "-q", "origin"); g(w, "rebase", "-q", "origin/main"); g(w, "push", "-q", "origin", "HEAD:main");
  g(w, "push", "-q", "origin", `HEAD:refs/heads/kaizen/${ID}`);
  expect(await removeWorktree(project, ID, idRun)).toEqual({ ok: true });
  expect(existsSync(w)).toBe(false);
  expect(g(project, "branch", "--list", `kaizen/${ID}`)).toBe("");
  expect(g(project, "ls-remote", "--heads", "origin", `kaizen/${ID}`)).toBe("");
  expect(state().worktree).toBeUndefined();
  expect(state().branch).toBeUndefined();
});

test("G-04 removeWorktree keeps unmerged work when nothing can prove it landed (no origin)", async () => {
  const w = (startWorktree(project, ID) as { path: string }).path;
  commit(w, "run.txt", "mine");
  g(project, "remote", "remove", "origin");
  const r = await removeWorktree(project, ID, idRun);
  expect(r.ok).toBe(false);
  expect(existsSync(w)).toBe(true);
  expect(g(project, "branch", "--list", `kaizen/${ID}`)).toContain(ID);
});
