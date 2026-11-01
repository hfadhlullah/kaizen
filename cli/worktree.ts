// One branch and one git worktree per run, so agents building at the same time never
// share a working folder. Run notes stay in the project's .kaizen/runs/<id>/; only the
// code lives in the worktree. Every git call is an argv array, never a shell string.
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, renameSync, realpathSync } from "node:fs";
import { join, dirname, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { branchesOf } from "./add-project.ts";

export type Out = { ok: boolean; out: string; why: string };
export type Run = (cmd: string[], cwd: string, ms?: number) => Out;

const SLUG = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/;
const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };

export const run: Run = (cmd, cwd, ms = 120_000) => {
  try {
    const r = Bun.spawnSync(cmd, { cwd, env, stdin: "ignore", timeout: ms, windowsHide: true });
    const out = r.stdout.toString().trimEnd(), err = r.stderr.toString().trim();
    return { ok: r.exitCode === 0, out, why: (err || out).split("\n").pop() || `${cmd[0]} did not finish` };
  } catch { return { ok: false, out: "", why: `${cmd[0]} is not installed` }; }
};

const git = (cwd: string, ...a: string[]) => run(["git", ...a], cwd);

export const branchOf = (id: string) => `kaizen/${id}`;
export const worktreeOf = (project: string, id: string) => join(project, ".kaizen", "wt", id);

const file = (project: string, id: string) => join(project, ".kaizen", "runs", id, "state.json");

function patchState(project: string, id: string, set: Record<string, unknown>) {
  const f = file(project, id), s = JSON.parse(readFileSync(f, "utf8"));
  for (const [k, v] of Object.entries(set)) { if (v === null) delete s[k]; else s[k] = v; }
  writeFileSync(f, JSON.stringify(s));
}

/** The folder a run's code is in: its worktree while it has one, else the project. */
export function codeDir(project: string, id: string): string {
  try {
    const w = JSON.parse(readFileSync(file(project, id), "utf8")).worktree;
    if (typeof w === "string" && existsSync(w)) return w;
  } catch { /* no state, no worktree */ }
  return project;
}

/** The project folder when `dir` is inside one of its run worktrees, else `dir`. */
export const projectFromWorktree = (dir: string) => {
  const m = /^(.*?)[\\/]\.kaizen[\\/]wt[\\/]/.exec(dir);
  return m ? m[1]! : dir;
};

const baseOf = (project: string) => {
  const head = git(project, "symbolic-ref", "--short", "refs/remotes/origin/HEAD");
  return head.ok ? head.out.replace(/^origin\//, "") : "main";
};

/** The feature branch a run was cut from and lands on, or null for the remote default branch. */
const localBase = (project: string, id: string): string | null => {
  try { const b = JSON.parse(readFileSync(file(project, id), "utf8")).base_branch; return typeof b === "string" && b ? b : null; } catch { return null; }
};
const baseOfRun = (project: string, id: string) => localBase(project, id) ?? baseOf(project);
// The ref that proves a run's work is on its base: local for a feature branch, which may never be pushed.
const baseRef = (project: string, id: string) => localBase(project, id) ?? `origin/${baseOf(project)}`;

/**
 * Makes the run's worktree and branch and records both. Off the remote default branch, or,
 * when the project is on another branch, off that local branch, unpushed commits included,
 * recorded as `base_branch`. `warn` names uncommitted changes, which a worktree never carries.
 */
export function startWorktree(project: string, id: string): { ok: true; path: string; branch: string; warn?: string } | { ok: false; why: string } {
  if (!SLUG.test(id)) return { ok: false, why: `"${id}" is not a run id` };
  if (!existsSync(file(project, id))) return { ok: false, why: "no such run" };
  if (!git(project, "rev-parse", "--is-inside-work-tree").ok) return { ok: false, why: "not a git repository" };
  const path = worktreeOf(project, id), branch = branchOf(id);
  if (existsSync(path)) return { ok: true, path, branch }; // already made: a resume
  if (!git(project, "remote").out) return { ok: false, why: "no git remote to branch from" };
  const f = git(project, "fetch", "origin");
  if (!f.ok) return { ok: false, why: `fetch failed: ${f.why}` };
  const here = git(project, "symbolic-ref", "--short", "-q", "HEAD"), feature = here.ok && here.out && here.out !== baseOf(project) ? here.out : null;
  const base = feature ?? `origin/${baseOf(project)}`;
  const exists = git(project, "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`).ok;
  const add = git(project, "worktree", "add", ...(exists ? [path, branch] : [path, "--no-track", "-b", branch, base]));
  if (!add.ok) return { ok: false, why: add.why };
  patchState(project, id, { worktree: path, branch, ...(feature ? { base_branch: feature, base_sha: git(project, "rev-parse", "HEAD").out } : {}) });
  const dirty = feature ? git(project, "status", "--porcelain").out : "";
  return { ok: true, path, branch, ...(dirty ? { warn: `uncommitted changes in ${feature} are not in the worktree:\n${dirty}` } : {}) };
}

export type LandKind = "conflict" | "check" | "merge";
export type Landed = { ok: true; how: "pr" | "push" | "merge"; url?: string } | { ok: false; why: string; kind?: LandKind; paths?: string[] };
type Failed = Extract<Landed, { ok: false }>;

// The project's own config over the global one; the defaults are safe: nothing auto-resolves.
// Read here because settings.ts loads state.ts, which loads this file.
const readGit = (text: string, key: string) => {
  const m = new RegExp(`^git:[^\\n]*\\n(?:(?:[ \\t]+[^\\n]*|)\\n)*?[ \\t]+${key}:[ \\t]*([^\\n]*)`, "m").exec(text.replace(/\r\n/g, "\n"));
  return m ? m[1]!.split(" #")[0]!.trim().replace(/^["']|["']$/g, "") : null;
};
const gitSetting = (project: string, key: string, fallback: string) => {
  for (const f of [join(project, ".kaizen", "config.yml"), join(homedir(), ".kaizen", "config.yml")]) {
    try { const v = readGit(readFileSync(f, "utf8"), key); if (v !== null) return v; } catch { /* no such file */ }
  }
  return fallback;
};
const LONG = 30 * 60_000; // a project's check or rebuild may outlast a git call
const shell = (cmd: string) => ["sh", "-c", cmd];

/** The command `git.land_check` stands for in `dir`, or null for none. */
function landCheck(project: string, dir: string): string | null {
  const v = gitSetting(project, "land_check", "auto");
  if (v === "off" || v === "") return null;
  if (v !== "auto") return v;
  try {
    const t = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).scripts?.test;
    if (typeof t !== "string" || /no test specified/.test(t)) return null;
    return existsSync(join(dir, "bun.lock")) || existsSync(join(dir, "bun.lockb")) ? "bun run test" : "npm test";
  } catch { return null; }
}

/**
 * Rebases the worktree onto `ref`. Conflicts only in `git.generated` paths take the base's
 * side and are rebuilt in one commit; anything else aborts, leaving the branch as it was.
 * A failed rebuild or check puts the branch back too, so a retry runs the check again.
 */
function rebaseOnto(project: string, dir: string, ref: string, sh: Run): Failed | null {
  const before = sh(["git", "rev-parse", "HEAD"], dir).out;
  const behind = sh(["git", "rev-list", "--count", `HEAD..${ref}`], dir);
  if (!behind.ok) return { ok: false, kind: "merge", why: `cannot compare with ${ref}: ${behind.why}` };
  if (Number(behind.out) === 0) return null;
  const globs = gitSetting(project, "generated", "").split(/[\s,]+/).filter(Boolean).map((p) => new Bun.Glob(p));
  const generated = (p: string) => globs.some((g) => g.match(p));
  const giveUp = (why: string, paths?: string[]): Failed => {
    sh(["git", "rebase", "--abort"], dir);
    return { ok: false, kind: "conflict", why: `${why}; worktree kept`, ...(paths ? { paths } : {}) };
  };
  let resolved = false, rb = sh(["git", "rebase", ref], dir);
  while (!rb.ok) {
    const paths = sh(["git", "diff", "--name-only", "--diff-filter=U"], dir).out.split("\n").filter(Boolean);
    if (!paths.length) return giveUp(`rebase onto ${ref} stopped: ${rb.why}`);
    const real = paths.filter((p) => !generated(p));
    if (real.length) return giveUp(`rebase onto ${ref} conflicts in ${real.join(", ")}`, real);
    // In a rebase "ours" is the base. A file deleted on the base has no such side: not routine.
    if (!sh(["git", "checkout", "--ours", "--", ...paths], dir).ok || !sh(["git", "add", "--", ...paths], dir).ok) return giveUp(`could not resolve ${paths.join(", ")}`, paths);
    resolved = true;
    // A commit that changed only generated files has nothing left.
    const empty = sh(["git", "diff", "--cached", "--quiet"], dir).ok;
    rb = sh(empty ? ["git", "rebase", "--skip"] : ["git", "-c", "core.editor=true", "rebase", "--continue"], dir);
  }
  const back = (why: string): Failed => { sh(["git", "reset", "--hard", before], dir); return { ok: false, kind: "check", why: `${why}; branch put back, worktree kept` }; };
  const rebuild = gitSetting(project, "rebuild_on_land", "");
  if (resolved && rebuild) {
    const b = sh(shell(rebuild), dir, LONG);
    if (!b.ok) return back(`rebuild failed: ${b.why}`);
    const made = sh(["git", "ls-files", "-m", "-o", "--exclude-standard"], dir).out.split("\n").filter(generated);
    if (made.length) {
      sh(["git", "add", "--", ...made], dir);
      const c = sh(["git", "commit", "-qm", "chore: rebuild generated files"], dir);
      if (!c.ok) return back(`rebuild commit failed: ${c.why}`);
    }
    sh(["git", "reset", "--hard", "HEAD"], dir);
  }
  const check = landCheck(project, dir);
  if (check) {
    const c = sh(shell(check), dir, LONG);
    if (!c.ok) return back(`check failed (${check}): ${c.why}`);
    sh(["git", "reset", "--hard", "HEAD"], dir); // a check that rewrites tracked files is not the work
  }
  return null;
}

/** Pushes the run's own branch; a rebased one replaces its pushed self under a lease. Never the base. */
function pushBranch(dir: string, branch: string, sh: Run) {
  const old = sh(["git", "rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}`], dir);
  const rewrote = old.ok && old.out && !sh(["git", "merge-base", "--is-ancestor", old.out, "HEAD"], dir).ok;
  return sh(["git", "push", ...(rewrote ? [`--force-with-lease=refs/heads/${branch}:${old.out}`] : []), "-u", "origin", `HEAD:refs/heads/${branch}`], dir);
}

const landFile = (project: string, id: string) => join(project, ".kaizen", "runs", id, "land.json");
const clearLand = (project: string, id: string) => rmSync(landFile(project, id), { force: true });

/** `kaizen worktree land`: lands, then leaves what stopped it on the run for the board. */
export function landRun(project: string, id: string, term?: string): Landed {
  const r = landWorktree(project, id);
  if (r.ok) clearLand(project, id);
  else if (r.kind) {
    const f = landFile(project, id), tmp = `${f}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ kind: r.kind, why: r.why, ...(r.paths ? { paths: r.paths } : {}), ...(term ? { term } : {}), at: Date.now() }));
    renameSync(tmp, f);
  }
  return r;
}

// Whether every commit of the branch is on the base, by patch: a rebase-merge rewrites
// the hashes, so "is an ancestor" would say not landed for work that is.
// A cherry that fails (no origin, no origin/<base>) proves nothing: not landed.
const landed = (dir: string, ref: string, branch: string, sh: Run = run) => {
  const r = sh(["git", "cherry", ref, branch], dir);
  return r.ok && r.out.split("\n").every((l) => !l.startsWith("+"));
};

/**
 * Pushes the run's branch and lands it on the base: a pull request rebase-merged when
 * `gh` is there and the pull request is clean, else a rebase and push, retried once.
 * The worktree and branch go only after the base holds the work; any failure leaves
 * them where they are.
 */
export function landWorktree(project: string, id: string, sh: Run = run,
  // gh only knows GitHub: any other remote lands by rebase and push.
  hasGh = !!Bun.which("gh") && /github\.com/.test(git(project, "remote", "get-url", "origin").out)): Landed {
  if (!SLUG.test(id)) return { ok: false, why: `"${id}" is not a run id` };
  const dir = codeDir(project, id), branch = branchOf(id);
  if (dir === project) return { ok: false, why: "this run has no worktree" };
  const clean = (d: string) => !sh(["git", "status", "--porcelain"], d).out;
  if (!clean(dir)) return { ok: false, why: "the worktree has uncommitted changes; commit them first" };
  const feature = localBase(project, id);
  if (feature) {
    // Never push, stash or switch: the project folder may be in use. Anything but a clean merge stops here.
    const on = sh(["git", "symbolic-ref", "--short", "-q", "HEAD"], project).out;
    if (on !== feature) return { ok: false, why: `the project folder is on ${on || "a detached HEAD"}, not ${feature}; switch to it and land again. Worktree kept` };
    // Nothing was built: keep the branch rather than call that landed.
    const tip = sh(["git", "rev-parse", branch], project).out, from = JSON.parse(readFileSync(file(project, id), "utf8")).base_sha;
    if (tip && tip === from) return { ok: false, why: `${branch} has no commits of its own; worktree kept` };
    // Already merged (a retry after the worktree would not go): only the cleanup is left.
    if (!sh(["git", "merge-base", "--is-ancestor", branch, "HEAD"], project).ok) {
      const stop = rebaseOnto(project, dir, feature, sh);
      if (stop) return stop;
      const m = sh(["git", "merge", "--no-edit", branch], project);
      if (!m.ok) { sh(["git", "merge", "--abort"], project); return { ok: false, kind: "conflict", why: `merge into ${feature} failed: ${m.why}; worktree kept` }; }
    }
    const rm = git(project, "worktree", "remove", "--force", dir);
    if (!rm.ok) return { ok: false, why: `merged, but the worktree stays: ${rm.why}` };
    git(project, "branch", "-D", branch);
    patchState(project, id, { worktree: null, branch: null });
    return { ok: true, how: "merge" };
  }
  const base = baseOf(project);
  const finish = (how: "pr" | "push", url?: string): Landed => {
    git(project, "fetch", "origin");
    if (!landed(dir, `origin/${base}`, branch)) return { ok: false, why: `${how === "pr" ? "the pull request" : "the push"} went through but ${branch} is not on ${base} yet; worktree kept` };
    // The worktree is clean (checked above); --force is only for the untracked node_modules link.
    const rm = git(project, "worktree", "remove", "--force", dir);
    if (!rm.ok) return { ok: false, why: `landed, but the worktree stays: ${rm.why}` };
    git(project, "branch", "-D", branch);
    git(project, "push", "origin", "--delete", branch);
    patchState(project, id, { worktree: null, branch: null });
    return { ok: true, how, url };
  };

  const ref = `origin/${base}`;
  const fetched = sh(["git", "fetch", "origin"], dir);
  if (!fetched.ok) return { ok: false, kind: "merge", why: `fetch failed: ${fetched.why}` };
  // A retry after the merge went through: only the cleanup is left, and a rebase would empty the branch.
  if (Number(sh(["git", "rev-list", "--count", `${ref}..${branch}`], dir).out) > 0 && landed(dir, ref, branch, sh)) return finish("push");

  if (hasGh) {
    const stop = rebaseOnto(project, dir, ref, sh);
    if (stop) return stop;
    const push = pushBranch(dir, branch, sh);
    if (!push.ok) return { ok: false, kind: "merge", why: `push of ${branch} failed: ${push.why}` };
    const subject = git(dir, "log", "-1", "--format=%s").out;
    const pr = sh(["gh", "pr", "create", "--base", base, "--head", branch, "--title", subject, "--body", `Run ${id}.`], dir);
    // An existing pull request for the branch is fine: merge that one.
    const url = pr.ok ? pr.out.split("\n").pop() : undefined;
    // gh prints the "already exists" line, then the URL, and `why` holds only the last line.
    if (!pr.ok && !/already exists|\/pull\/\d+$/i.test(pr.why)) return { ok: false, kind: "merge", why: `pull request failed: ${pr.why}; ${branch} is pushed` };
    const merge = sh(["gh", "pr", "merge", branch, "--rebase"], dir);
    if (!merge.ok) return { ok: false, kind: "merge", why: `pull request not merged (${merge.why}); left open, worktree kept` };
    return finish("pr", url);
  }

  for (let i = 0; i < 2; i++) {
    const f = sh(["git", "fetch", "origin"], dir);
    if (!f.ok) return { ok: false, kind: "merge", why: `fetch failed: ${f.why}` };
    const stop = rebaseOnto(project, dir, ref, sh);
    if (stop) return stop;
    if (sh(["git", "push", "origin", `HEAD:${base}`], dir).ok) return finish("push");
  }
  return { ok: false, kind: "merge", why: `${base} kept moving; push rejected twice. Worktree kept` };
}

// ---- the Git tab: a run's branch, its pull request and its cleanup, one step at a time

export type Pr = { number: number; url: string; state: "OPEN" | "MERGED" | "CLOSED"; draft: boolean };
export type Branch = { branch: string; base: string; local?: boolean; upstream: boolean; landed: boolean; gh: boolean; pr: Pr | null; checking: boolean };
// The calls that wait on a network (push, fetch, gh): never on the board server's thread.
export type AsyncRun = (cmd: string[], cwd: string) => Promise<Out>;

// gh only knows GitHub. Asked once per project: the remote does not change under a board.
const githubs = new Map<string, boolean>();
const onGithub = (project: string) => {
  let v = githubs.get(project);
  if (v === undefined) githubs.set(project, (v = !!Bun.which("gh") && /github\.com/.test(git(project, "remote", "get-url", "origin").out)));
  return v;
};
// One look at GitHub per run every 30 s, in the background; the panel shows the last answer.
const prs = new Map<string, { at: number; pr: Pr | null }>();
const looking = new Set<string>();
const prKey = (project: string, id: string) => `${project}\0${id}`;
const PR_JSON = ["--json", "number,url,state,isDraft"];
const parsePr = (r: Out): Pr | null => {
  if (!r.ok) return null; // no pull request for the branch yet
  try {
    const j = JSON.parse(r.out);
    return { number: j.number, url: j.url, state: j.state, draft: !!j.isDraft };
  } catch { return null; }
};

/**
 * What the Git tab shows for a run on its own branch: the branch against the base, and its
 * pull request as last seen. A stale or missing answer starts one background `gh` look and
 * calls `changed` when it lands, so the panel refreshes; the request never waits on GitHub.
 */
export function branchState(project: string, id: string, changed: () => void = () => {}, sh: Run = run, ash: AsyncRun = runAsync, hasGh = onGithub(project)): Branch | null {
  if (!SLUG.test(id)) return null;
  const dir = codeDir(project, id);
  if (dir === project) return null; // committed in the project's own checkout: no branch of its own
  const branch = branchOf(id), base = baseOfRun(project, id), ref = baseRef(project, id);
  // A feature base may never have been pushed: it lands by local merge, with no pull request.
  const gh = hasGh && !localBase(project, id);
  const upstream = sh(["git", "rev-parse", "--abbrev-ref", `${branch}@{u}`], dir).ok;
  const k = prKey(project, id), hit = prs.get(k);
  if (gh && (!hit || Date.now() - hit.at >= 30_000) && !looking.has(k)) {
    looking.add(k);
    void ash(["gh", "pr", "view", branch, ...PR_JSON], dir).then((r) => {
      looking.delete(k);
      const pr = parsePr(r);
      const was = prs.get(k);
      prs.set(k, { at: Date.now(), pr });
      if (JSON.stringify(was?.pr ?? null) !== JSON.stringify(pr) || !was) changed();
    });
  }
  const pr = hit?.pr ?? null;
  // Landed counts only work that is on the base: a branch with no commits of its own is not "merged".
  const own = sh(["git", "rev-list", "--count", `${ref}..${branch}`], dir);
  const landedNow = pr?.state === "MERGED" || (own.ok && Number(own.out) > 0 && landed(dir, ref, branch, sh));
  return { branch, base, local: !!localBase(project, id), upstream, landed: landedNow, gh: gh, pr, checking: gh && !hit };
}

/** Pushes the branch, then opens its pull request against the base. */
export async function openPr(project: string, id: string, title: string, body: string, draft: boolean, sh: Run = run, ash: AsyncRun = runAsync, hasGh = onGithub(project)): Promise<{ ok: true; pr: Pr } | { ok: false; why: string }> {
  if (!SLUG.test(id)) return { ok: false, why: `"${id}" is not a run id` };
  const dir = codeDir(project, id), branch = branchOf(id);
  if (dir === project) return { ok: false, why: "This run has no branch of its own." };
  if (localBase(project, id)) return { ok: false, why: "This run lands by a local merge into its branch, with no pull request." };
  if (!hasGh) return { ok: false, why: "Pull requests need the GitHub CLI (gh) and a GitHub remote." };
  if (!title.trim()) return { ok: false, why: "A pull request needs a title." };
  if (sh(["git", "status", "--porcelain"], dir).out) return { ok: false, why: "Commit the changes first." };
  const push = await ash(["git", "push", "-u", "origin", branch], dir);
  if (!push.ok) return { ok: false, why: `Push of ${branch} failed: ${push.why}` };
  const r = await ash(["gh", "pr", "create", "--base", baseOfRun(project, id), "--head", branch, "--title", title.trim(), "--body", body, ...(draft ? ["--draft"] : [])], dir);
  // An existing pull request for the branch is fine: show that one.
  if (!r.ok && !/already exists/i.test(r.why)) return { ok: false, why: `Pull request failed: ${r.why}` };
  const pr = parsePr(await ash(["gh", "pr", "view", branch, ...PR_JSON], dir));
  prs.set(prKey(project, id), { at: Date.now(), pr });
  return pr ? { ok: true, pr } : { ok: false, why: "The pull request was made, but gh cannot find it yet. Look again in a moment." };
}

/** Merges the run's pull request by rebase, as `kaizen land` does. The worktree stays. */
export async function mergePr(project: string, id: string, sh: Run = run, ash: AsyncRun = runAsync, hasGh = onGithub(project)): Promise<{ ok: true } | { ok: false; why: string }> {
  if (!SLUG.test(id)) return { ok: false, why: `"${id}" is not a run id` };
  const dir = codeDir(project, id), branch = branchOf(id);
  if (dir === project) return { ok: false, why: "This run has no branch of its own." };
  if (localBase(project, id)) return { ok: false, why: "This run lands by a local merge: run kaizen worktree land." };
  if (!hasGh) return { ok: false, why: "Merging needs the GitHub CLI (gh) and a GitHub remote." };
  const r = await ash(["gh", "pr", "merge", branch, "--rebase"], dir);
  prs.delete(prKey(project, id));
  if (!r.ok) return { ok: false, why: `Not merged: ${r.why}` };
  await ash(["git", "fetch", "origin"], project); // so "landed" sees the merge at once
  return { ok: true };
}

/**
 * Removes the run's worktree and branch once its work is on the base. Refused while the
 * worktree has changes or any commit of the branch is not on the base, so nothing is lost.
 */
export async function removeWorktree(project: string, id: string, sh: Run = run, ash: AsyncRun = runAsync): Promise<{ ok: true } | { ok: false; why: string }> {
  if (!SLUG.test(id)) return { ok: false, why: `"${id}" is not a run id` };
  const dir = codeDir(project, id), branch = branchOf(id);
  if (dir === project) return { ok: false, why: "This run has no worktree." };
  if (sh(["git", "status", "--porcelain"], dir).out) return { ok: false, why: "The worktree has uncommitted changes. Commit or discard them first." };
  const feature = localBase(project, id), base = feature ?? baseOf(project), ref = baseRef(project, id);
  if (!feature) {
    const f = await ash(["git", "fetch", "origin"], project);
    if (!f.ok) return { ok: false, why: `Could not fetch origin, so nothing proves the work is on the base: ${f.why}` };
  }
  if (!sh(["git", "rev-parse", "--verify", "--quiet", ref], project).ok) return { ok: false, why: `${ref} does not exist, so nothing proves the work is on it.` };
  if (!landed(dir, ref, branch, sh)) return { ok: false, why: `${branch} has commits that are not on ${base} yet. Merge its pull request first.` };
  // Clean (checked above); --force is only for the untracked node_modules link.
  const rm = sh(["git", "worktree", "remove", "--force", dir], project);
  if (!rm.ok) return { ok: false, why: rm.why };
  // Every commit is on the base by patch, so -D loses nothing a rebase-merge rewrote.
  sh(["git", "branch", "-D", "--", branch], project);
  if (!feature) await ash(["git", "push", "origin", "--delete", branch], project); // best effort: GitHub may have deleted it
  prs.delete(prKey(project, id));
  patchState(project, id, { worktree: null, branch: null });
  clearLand(project, id);
  return { ok: true };
}

export type Workspace = { path: string; branch: string; main: boolean };
const listed = new Map<string, { at: number; ws: Workspace[] }>();
const inside = (p: string, root: string) => p === root || p.startsWith(root + sep);
// One spelling per folder: git prints real paths, a tmp or 8.3 path may not be one.
const real = (p: string) => { try { return realpathSync.native(p); } catch { return resolve(p); } };

/**
 * A project's workspaces: its main checkout first, then every other git worktree, from
 * `git worktree list --porcelain`. A folder that is not a repository is one workspace.
 * Prunable entries, and detached ones outside the project, are left out. Cached 10 s:
 * /state asks for every known project on each tick.
 */
export function workspaces(project: string, sh: Run = run): Workspace[] {
  const hit = listed.get(project);
  if (hit && Date.now() - hit.at < 10_000) return hit.ws;
  const ws = parseWorkspaces(project, existsSync(project) ? sh(["git", "worktree", "list", "--porcelain"], project) : null);
  listed.set(project, { at: Date.now(), ws });
  return ws;
}

/** git off the event loop, with the same 120 s ceiling as run(). */
export const runAsync = async (cmd: string[], cwd: string): Promise<Out> => {
  try {
    const p = Bun.spawn(cmd, { cwd, env, stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: 120_000, windowsHide: true });
    const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
    return { ok: (await p.exited) === 0, out: out.trimEnd(), why: err.trim() || `${cmd[0]} did not finish` };
  } catch { return { ok: false, out: "", why: `${cmd[0]} is not installed` }; }
};

/**
 * workspaces() for /state: never waits on git. A fresh cache answers; a stale one answers
 * and refreshes in the background; none yet answers the one folder until git replies.
 */
const refreshing = new Set<string>();
export function workspacesNow(project: string, sh = runAsync): Workspace[] {
  const hit = listed.get(project);
  if (hit && Date.now() - hit.at < 10_000) return hit.ws;
  if (!refreshing.has(project) && existsSync(project)) {
    refreshing.add(project);
    void sh(["git", "worktree", "list", "--porcelain"], project)
      .then((r) => listed.set(project, { at: Date.now(), ws: parseWorkspaces(project, r) }))
      .finally(() => refreshing.delete(project));
  }
  return hit?.ws ?? [{ path: project, branch: "", main: true }];
}

function parseWorkspaces(project: string, r: Out | null): Workspace[] {
  const main = { path: project, branch: "", main: true };
  if (!r?.ok) return [main];
  const all = r.out.split(/\n\s*\n/).map((b) => {
    const l = b.split("\n"), v = (k: string) => l.find((x) => x === k || x.startsWith(k + " "))?.slice(k.length + 1);
    return { path: real(v("worktree") ?? ""), branch: (v("branch") ?? "").replace(/^refs\/heads\//, ""), prunable: v("prunable") !== undefined, bare: v("bare") !== undefined };
  });
  // The first entry is the main checkout; the registered folder stands for it (it may sit below the root).
  main.branch = all[0]?.branch ?? "";
  return [main, ...all.slice(1).filter((w) => !w.prunable && !w.bare && w.path !== real(project) && existsSync(w.path) && (w.branch || inside(w.path, real(project))))
    .map((w) => ({ path: w.path, branch: w.branch, main: false }))];
}
export const forgetWorkspaces = (project: string) => listed.delete(project);
/** How old the cached list is, in ms; Infinity when none. */
export const workspacesAge = (project: string) => { const hit = listed.get(project); return hit ? Date.now() - hit.at : Infinity; };

/** The workspace a run belongs to: its recorded worktree (or the workspace it was started in) while that is still on disk, else the main checkout. */
export const wsOf = (project: string, state: { worktree?: unknown; workspace?: unknown }) => {
  const w = [state.worktree, state.workspace].find((x) => typeof x === "string" && existsSync(x));
  return typeof w === "string" ? real(w) : project;
};

/** A board terminal's link to the run it started a worktree for: <state>/sessions/<key>.run holds the run id. */
const termFile = (state: string, key: string) => join(state, "sessions", `${key}.run`);
export const linkTerm = (state: string, key: string | undefined, id: string) => {
  if (!key || !/^sh-[0-9a-f]{8}$/.test(key)) return;
  mkdirSync(join(state, "sessions"), { recursive: true });
  writeFileSync(termFile(state, key), id);
};
/** The first agent of a handed-off run stays where it is: its tab does not follow the worktree. */
export const unlinkTerm = (state: string, key: string) => { rmSync(termFile(state, key), { force: true }); };
/** The worktree a linked terminal's live run is in; null when it has no link, the run ended, or the worktree is gone. */
export function linkedWs(state: string, key: string): string | null {
  try {
    const id = readFileSync(termFile(state, key), "utf8").trim();
    const s = JSON.parse(readFileSync(join(state, "runs", id, "state.json"), "utf8"));
    if (s.stage === "done" || s.stage === "abandoned") return null;
    const project = dirname(state), w = wsOf(project, s);
    return w === project ? null : w;
  } catch { return null; }
}

/**
 * `kaizen worktree start` run from inside one of the project's other workspaces: the run is
 * placed there (`workspace` in state.json) and no second worktree is made. It is not recorded
 * as the run's `worktree`: land would then remove a folder and branch the user made.
 */
export function adoptWorkspace(project: string, id: string, here: string): { ok: true; path: string } | null {
  if (!SLUG.test(id) || !existsSync(file(project, id))) return null;
  const at = real(here), w = workspaces(project).find((x) => !x.main && x.path !== real(worktreeOf(project, id)) && inside(at, x.path));
  if (!w) return null;
  patchState(project, id, { workspace: w.path });
  return { ok: true, path: w.path };
}

/** A new worktree for `branch` under <project>/.kaizen/wt/, the branch made off `base` (one of branchesOf's) or HEAD. */
export function addWorktree(project: string, branch: string, sh: Run = run, base?: string): { ok: true; path: string } | { ok: false; why: string } {
  if (!branch || branch.startsWith("-") || branch.length > 200) return { ok: false, why: "not a branch name" };
  if (!sh(["git", "rev-parse", "--is-inside-work-tree"], project).ok) return { ok: false, why: "not a git repository" };
  if (!sh(["git", "check-ref-format", "--branch", branch], project).ok) return { ok: false, why: `"${branch}" is not a valid branch name` };
  if (base !== undefined && (base.startsWith("-") || !branchesOf(project, sh).branches.includes(base))) return { ok: false, why: `"${base}" is not a branch of this project` };
  const path = join(project, ".kaizen", "wt", branch.replace(/[^\w.-]+/g, "-").replace(/^\.+/, ""));
  if (existsSync(path)) return { ok: false, why: "that worktree folder already exists" };
  const add = sh(["git", "worktree", "add", ...(base ? ["--no-track"] : []), "-b", branch, "--", path, ...(base ? [base] : [])], project);
  forgetWorkspaces(project);
  return add.ok ? { ok: true, path: real(path) } : { ok: false, why: add.why };
}
