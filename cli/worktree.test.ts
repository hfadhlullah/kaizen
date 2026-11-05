// A real bare remote, two clones and real git: the landing is only as good as git says.
import { test, expect, beforeEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { notice } from "./state.ts";
import { linkTerm, linkedWs, startWorktree, landWorktree, landRun, codeDir, projectFromWorktree, run, runAsync, workspaces, workspacesNow, addWorktree, wsOf, adoptWorkspace, branchState, branchFor, openPr, mergePr, removeWorktree, type Run, type AsyncRun } from "./worktree.ts";

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
    if (cmd[0] !== "gh") return idRun(cmd, cwd);
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

test("a linked terminal shows its live run's worktree, then falls back", () => {
  const p = realpathSync(mkdtempSync(join(tmpdir(), "kz-link-"))), state = join(p, ".kaizen"), id = "r1", wt = join(p, "wt");
  mkdirSync(join(state, "runs", id), { recursive: true }); mkdirSync(wt);
  const put = (s: object) => writeFileSync(join(state, "runs", id, "state.json"), JSON.stringify(s));
  put({ stage: "build", worktree: wt });
  linkTerm(state, "bad key", id);
  linkTerm(state, "sh-0123abcd", id);
  expect(linkedWs(state, "sh-0123abcd")).toBe(wt);
  expect(linkedWs(state, "sh-ffffffff")).toBeNull();     // an unlinked terminal stays put
  put({ stage: "done", worktree: wt });
  expect(linkedWs(state, "sh-0123abcd")).toBeNull();
  put({ stage: "abandoned", worktree: wt });
  expect(linkedWs(state, "sh-0123abcd")).toBeNull();
  put({ stage: "build", worktree: join(p, "gone") });
  expect(linkedWs(state, "sh-0123abcd")).toBeNull();
  put({ stage: "build" });                               // a current-folder run has no worktree
  expect(linkedWs(state, "sh-0123abcd")).toBeNull();
});

const feature = () => { g(project, "switch", "-qc", "feature-x"); commit(project, "f.txt", "unpushed"); };

test("G-02 on a feature branch the worktree holds unpushed commits and lands by a local merge", () => {
  feature();
  const r = startWorktree(project, ID);
  expect(r.ok).toBe(true);
  expect(state().base_branch).toBe("feature-x");
  expect(existsSync(join(state().worktree, "f.txt"))).toBe(true);
  commit(state().worktree, "b.txt", "b");
  const dir = state().worktree;
  expect(landWorktree(project, ID, idRun)).toMatchObject({ ok: true, how: "merge" });
  expect(existsSync(join(project, "b.txt"))).toBe(true);
  expect(existsSync(dir)).toBe(false);
  expect(run(["git", "rev-parse", "--verify", "--quiet", "refs/remotes/origin/feature-x"], project).ok).toBe(false);
});

test("G-03 a conflict, or the project on another branch, keeps the worktree and branch", () => {
  feature();
  startWorktree(project, ID);
  const dir = state().worktree;
  commit(dir, "f.txt", "theirs"); commit(project, "f.txt", "ours");
  const c = landWorktree(project, ID, idRun);
  expect(c.ok).toBe(false);
  expect(g(project, "status", "--porcelain").includes("U")).toBe(false);
  g(project, "switch", "-q", "main");
  const o = landWorktree(project, ID, idRun);
  expect(!o.ok && o.why).toContain("feature-x");
  expect(existsSync(dir)).toBe(true);
  expect(run(["git", "rev-parse", "--verify", "--quiet", "refs/heads/kaizen/" + ID], project).ok).toBe(true);
});

test("G-02 uncommitted changes on the feature branch are warned about", () => {
  feature(); writeFileSync(join(project, "wip.txt"), "wip");
  const r = startWorktree(project, ID);
  expect(r.ok && r.warn).toContain("wip.txt");
});

test("G-01 on the default branch no base_branch is recorded", () => {
  startWorktree(project, ID);
  expect(state().base_branch).toBeUndefined();
});

test("land again after a merge whose cleanup failed only cleans up", () => {
  feature(); startWorktree(project, ID);
  commit(state().worktree, "b.txt", "b");
  g(project, "merge", "--no-edit", "kaizen/" + ID);
  const head = g(project, "rev-parse", "HEAD");
  expect(landWorktree(project, ID, idRun)).toMatchObject({ ok: true, how: "merge" });
  expect(g(project, "rev-parse", "HEAD")).toBe(head);
});

test("cold 6: a run with no commits is not landed, and a feature base offers no pull request", async () => {
  feature(); startWorktree(project, ID);
  const r = landWorktree(project, ID, idRun);
  expect(!r.ok && r.why).toContain("no commits");
  expect(existsSync(state().worktree)).toBe(true);
  const b = branchState(project, ID, () => {}, idRun, runAsync, true)!;
  expect(b).toMatchObject({ base: "feature-x", local: true, gh: false });
  expect((await openPr(project, ID, "t", "b", false, idRun, runAsync, true)).ok).toBe(false);
});

// ---- land: rebase first, resolve only what is generated, record what stops it
const land = () => landWorktree(project, ID, idRun, false);
const cfg = (t: string) => writeFileSync(join(project, ".kaizen/config.yml"), t);
const upstream = (f: string, t: string) => { commit(other, f, t); g(other, "pull", "-q", "--rebase", "origin", "main"); g(other, "push", "-q", "origin", "HEAD:main"); };
const wt = () => state().worktree as string;

test("L-01 a stale branch that was never pushed lands with no force", () => {
  startWorktree(project, ID); commit(wt(), "b.txt", "b"); upstream("c.txt", "c");
  const seen: string[][] = [];
  const r = landWorktree(project, ID, (c, d, m) => (seen.push(c), idRun(c, d, m)), false);
  expect(r.ok).toBe(true);
  expect(seen.flat().join(" ")).not.toContain("force");
  expect(g(other, "ls-remote", "origin", "main")).toBeTruthy();
});

test("L-02 conflicts only in generated files land, rebuilt in one commit", () => {
  cfg('git:\n  generated: "*.js"\n  rebuild_on_land: "echo rebuilt > app.js"\n  land_check: off\n');
  commit(project, "app.js", "0"); g(project, "push", "-q", "origin", "HEAD:main"); g(other, "pull", "-q", "origin", "main");
  startWorktree(project, ID); writeFileSync(join(wt(), "app.js"), "mine"); writeFileSync(join(wt(), "b.txt"), "b"); g(wt(), "add", "."); g(wt(), "commit", "-qm", "feat: b");
  upstream("app.js", "theirs");
  expect(land().ok).toBe(true);
  g(other, "pull", "-q", "origin", "main");
  expect(readFileSync(join(other, "app.js"), "utf8").trim()).toBe("rebuilt");
  expect(g(other, "log", "--format=%s", "-3")).toContain("chore: rebuild generated files");
  expect(readFileSync(join(other, "b.txt"), "utf8")).toBe("b");
});

test("L-03 any other conflict aborts with branch, worktree and commits intact; default settings resolve nothing", () => {
  startWorktree(project, ID); commit(wt(), "a.txt", "mine"); const tip = g(wt(), "rev-parse", "HEAD");
  upstream("a.txt", "theirs");
  const r = land();
  expect(r).toMatchObject({ ok: false, kind: "conflict", paths: ["a.txt"] });
  expect(g(wt(), "rev-parse", "HEAD")).toBe(tip);
  expect(g(wt(), "status", "--porcelain")).toBe("");
  expect(existsSync(wt())).toBe(true);
});

test("L-04 a failing check stops the land and puts the branch back; off and no pulled commits skip it", () => {
  cfg('git:\n  land_check: "exit 3"\n');
  startWorktree(project, ID); commit(wt(), "b.txt", "b"); const tip = g(wt(), "rev-parse", "HEAD");
  upstream("c.txt", "c");
  expect(land()).toMatchObject({ ok: false, kind: "check" });
  expect(g(wt(), "rev-parse", "HEAD")).toBe(tip);
  cfg('git:\n  land_check: off\n');
  expect(land().ok).toBe(true);
});

test("L-04b no pulled commits skip the check", () => {
  cfg('git:\n  land_check: "exit 3"\n');
  startWorktree(project, ID); commit(wt(), "b.txt", "b");
  expect(land().ok).toBe(true);
});

test("L-05 merge=union keeps both lines of the log", () => {
  commit(project, ".gitattributes", "Log.md merge=union\n"); commit(project, "Log.md", "0\n"); g(project, "push", "-q", "origin", "HEAD:main"); g(other, "pull", "-q", "origin", "main");
  startWorktree(project, ID); commit(wt(), "Log.md", "0\nmine\n"); upstream("Log.md", "0\ntheirs\n");
  expect(land().ok).toBe(true);
  g(other, "pull", "-q", "origin", "main");
  const log = readFileSync(join(other, "Log.md"), "utf8");
  expect(log).toContain("mine"); expect(log).toContain("theirs");
});

test("L-06 a rebased pushed branch force pushes under a lease, on its own branch only", () => {
  startWorktree(project, ID); commit(wt(), "b.txt", "b"); g(wt(), "push", "-q", "origin", `HEAD:refs/heads/kaizen/${ID}`); upstream("c.txt", "c");
  const pushes: string[][] = [];
  const r = landWorktree(project, ID, (c, d, m) => { if (c.includes("push")) pushes.push(c); return c.includes("gh") ? { ok: true, out: "", why: "" } : idRun(c, d, m); }, true);
  const forced = pushes.filter((p) => p.some((a) => a.includes("force")));
  expect(forced.length).toBe(1);
  expect(forced[0]!.some((a) => a.startsWith(`--force-with-lease=refs/heads/kaizen/${ID}:`))).toBe(true);
  expect(forced[0]!.at(-1)).toBe(`HEAD:refs/heads/kaizen/${ID}`);
  expect(r.ok).toBe(false); // the stub gh merged nothing
});

test("L-07 land.json records a failure and clears on success", () => {
  startWorktree(project, ID); commit(wt(), "a.txt", "mine");
  const f = join(project, ".kaizen/runs", ID, "land.json");
  writeFileSync(f, JSON.stringify({ kind: "conflict", why: "old" }));
  const r = landRun(project, ID);
  // No git identity in CI matters only for a rebase; nothing was pulled here.
  expect(r.ok).toBe(true);
  expect(existsSync(f)).toBe(false);
});

test("L-08 land.json holds what stopped the land, and the board card reads it", () => {
  // landRun uses the plain runner: give this repo the identity CI lacks.
  g(project, "config", "user.email", "a@b.c"); g(project, "config", "user.name", "t");
  startWorktree(project, ID); commit(wt(), "a.txt", "mine"); upstream("a.txt", "theirs");
  expect(landRun(project, ID, "sh-12345678").ok).toBe(false);
  const l = JSON.parse(readFileSync(join(project, ".kaizen/runs", ID, "land.json"), "utf8"));
  expect(l).toMatchObject({ kind: "conflict", paths: ["a.txt"], term: "sh-12345678" });
  expect(notice({ kind: "run", text: "x", where: "p", status: "done", land: l } as any)).toBe("x — conflict: a.txt\np");
});

test("L-09 generated conflict with no rebuild command stops the land", () => {
  cfg('git:\n  generated: "*.js"\n  land_check: off\n');
  commit(project, "app.js", "0"); g(project, "push", "-q", "origin", "HEAD:main"); g(other, "pull", "-q", "origin", "main");
  startWorktree(project, ID); commit(wt(), "app.js", "mine"); const tip = g(wt(), "rev-parse", "HEAD"); upstream("app.js", "theirs");
  expect(land()).toMatchObject({ ok: false, kind: "conflict", paths: ["app.js"] });
  expect(g(wt(), "rev-parse", "HEAD")).toBe(tip);
});

test("L-10 a failure with no kind replaces an old Conflict; a run with no worktree records nothing", () => {
  const f = join(project, ".kaizen/runs", ID, "land.json");
  expect(landRun(project, ID).ok).toBe(false);
  expect(existsSync(f)).toBe(false);
  startWorktree(project, ID); writeFileSync(f, JSON.stringify({ kind: "conflict", why: "old" }));
  writeFileSync(join(wt(), "dirty.txt"), "x");
  expect(landRun(project, ID).ok).toBe(false);
  expect(JSON.parse(readFileSync(f, "utf8")).kind).toBe("merge");
});

// ---- a run made by hand records its real branch in state.json; every git action names that one
const setState = (set: Record<string, unknown>) => writeFileSync(join(project, ".kaizen/runs", ID, "state.json"), JSON.stringify({ ...state(), ...set }));
function handMade(name: string) {
  const path = join(project, ".kaizen", "wt", ID);
  g(project, "worktree", "add", "-q", path, "--no-track", "-b", name, "origin/main");
  setState({ worktree: path, branch: name });
  commit(path, "hand.txt", "h");
  return path;
}

// G-01
test("R-01 the recorded branch is the run's branch in the panel, the push, the PR and the merge", async () => {
  handMade("feat/hand-made");
  const b = branchState(project, ID, () => {}, idRun, runAsync, true)!;
  expect(b.branch).toBe("feat/hand-made");
  const seen: string[][] = [];
  const ash: AsyncRun = async (cmd, cwd) => { seen.push(cmd); return cmd[0] === "gh" && cmd[1] === "pr" && cmd[2] === "view" ? { ok: true, out: JSON.stringify({ number: 3, url: "u", state: "OPEN", isDraft: false, mergeable: "MERGEABLE", statusCheckRollup: [] }), why: "" } : { ok: true, out: "", why: "" }; };
  await openPr(project, ID, "t", "b", false, idRun, ash, true);
  expect(seen.find((c) => c[0] === "git" && c[1] === "push")).toEqual(["git", "push", "-u", "origin", "feat/hand-made"]);
  expect(seen.find((c) => c[1] === "pr" && c[2] === "create")).toContain("feat/hand-made");
  seen.length = 0;
  await mergePr(project, ID, idRun, ash, true);
  expect(seen.find((c) => c[1] === "pr" && c[2] === "merge")![3]).toBe("feat/hand-made");
  expect(seen.flat().join(" ")).not.toContain("kaizen/");
});

test("R-02 landing and cleanup act on the recorded branch, and leave kaizen/<id> alone", () => {
  const path = handMade("feat/hand-made");
  const r = landWorktree(project, ID, idRun, false);
  expect(r.ok).toBe(true);
  expect(g(project, "ls-remote", "--heads", "origin", "feat/hand-made")).toBe("");  // landed by rebase and push to the base, no stray branch pushed
  expect(g(project, "ls-remote", "--heads", "origin", `kaizen/${ID}`)).toBe("");
  expect(existsSync(path)).toBe(false);
  expect(g(project, "branch", "--list", "feat/hand-made")).toBe("");                  // cleanup removed the real branch
});

// G-02
test("R-03 a run without a recorded branch, or with an unsafe one, keeps kaizen/<id>", () => {
  expect(branchFor(project, ID)).toBe(`kaizen/${ID}`);
  for (const bad of ["-x", "--upload-pack=x", "a..b", "a b", "x/", "x.", "x.lock", "a//b", "", "/abs", 42, null, ["feat/x"], "x".repeat(201), "a;b", "a\nb"]) {
    setState({ branch: bad });
    expect(branchFor(project, ID)).toBe(`kaizen/${ID}`);
  }
  for (const ok of ["feat/kaizen-rpg", "main2", "release-1.70", "a/b/c"]) { setState({ branch: ok }); expect(branchFor(project, ID)).toBe(ok); }
  expect(branchFor(project, "no-such-run")).toBe("kaizen/no-such-run");
});

// G-03
test("R-04 a worktree made by kaizen still records and uses kaizen/<id>", () => {
  startWorktree(project, ID);
  expect(state().branch).toBe(`kaizen/${ID}`);
  expect(branchFor(project, ID)).toBe(`kaizen/${ID}`);
});

// ---- the base is never the run's branch; runs that share a branch do not remove it under each other
// G-02
test("R-05 a recorded branch equal to the base, the feature base or HEAD falls back to kaizen/<id>", () => {
  for (const b of ["main", "HEAD"]) { setState({ branch: b }); expect(branchFor(project, ID)).toBe(`kaizen/${ID}`); }
  setState({ branch: "feature-x", base_branch: "feature-x" });
  expect(branchFor(project, ID)).toBe(`kaizen/${ID}`);
  setState({ branch: "feature-y", base_branch: "feature-x" });
  expect(branchFor(project, ID)).toBe("feature-y");
});

test("R-06 cleanup with the base recorded as the branch never deletes the base", async () => {
  feature();                                                                     // the project is on feature-x, which a run lands on
  const path = join(project, ".kaizen", "wt", ID);
  g(project, "worktree", "add", "-q", path, "--no-track", "-b", "feat/real", "feature-x");
  setState({ worktree: path, branch: "feature-x", base_branch: "feature-x" });   // a bad record: the base as the branch
  g(project, "switch", "-q", "main");                                            // so feature-x is not checked out and git would delete it
  const tip = g(project, "rev-parse", "feature-x");
  await removeWorktree(project, ID, idRun, runAsync);
  expect(g(project, "rev-parse", "feature-x")).toBe(tip);
});

const ID2 = "2026-10-17-second";
const second = (path: string) => { mkdirSync(join(project, ".kaizen/runs", ID2), { recursive: true }); writeFileSync(join(project, ".kaizen/runs", ID2, "state.json"), JSON.stringify({ id: ID2, stage: "done", worktree: path, branch: "feat/shared" })); };
const state2 = () => JSON.parse(readFileSync(join(project, ".kaizen/runs", ID2, "state.json"), "utf8"));

test("R-07 two runs on one branch: landing or cleaning up one keeps the worktree and the branch for the other", async () => {
  const path = handMade("feat/shared"); second(path);
  const r = landWorktree(project, ID, idRun, false);
  expect(r.ok).toBe(true);
  expect(existsSync(path)).toBe(true);
  expect(g(project, "branch", "--list", "feat/shared")).toContain("feat/shared");
  const rm = await removeWorktree(project, ID, idRun, runAsync);
  expect(!rm.ok && rm.why).toContain(ID2);
  expect(existsSync(path)).toBe(true);
  // The other run is done with it: now the last run can remove both.
  writeFileSync(join(project, ".kaizen/runs", ID2, "state.json"), JSON.stringify({ ...state2(), worktree: null, branch: null }));
  expect((await removeWorktree(project, ID, idRun, runAsync)).ok).toBe(true);
  expect(existsSync(path)).toBe(false);
  expect(g(project, "branch", "--list", "feat/shared")).toBe("");
});

test("R-08 a recorded branch that does not exist is shown as recorded, without an error", () => {
  const path = join(project, ".kaizen", "wt", ID); mkdirSync(path, { recursive: true });
  g(project, "worktree", "add", "-q", "-f", path + "-x", "--no-track", "-b", "feat/other", "origin/main");
  setState({ worktree: path + "-x", branch: "feat/gone" });
  expect(branchState(project, ID, () => {}, idRun, runAsync, false)!.branch).toBe("feat/gone");
});
