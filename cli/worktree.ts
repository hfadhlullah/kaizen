// One branch and one git worktree per run, so agents building at the same time never
// share a working folder. Run notes stay in the project's .kaizen/runs/<id>/; only the
// code lives in the worktree. Every git call is an argv array, never a shell string.
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";

export type Out = { ok: boolean; out: string; why: string };
export type Run = (cmd: string[], cwd: string) => Out;

const SLUG = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/;
const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };

export const run: Run = (cmd, cwd) => {
  try {
    const r = Bun.spawnSync(cmd, { cwd, env, stdin: "ignore", timeout: 120_000, windowsHide: true });
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

/** Makes the run's worktree and branch off the remote default branch and records both. */
export function startWorktree(project: string, id: string): { ok: true; path: string; branch: string } | { ok: false; why: string } {
  if (!SLUG.test(id)) return { ok: false, why: `"${id}" is not a run id` };
  if (!existsSync(file(project, id))) return { ok: false, why: "no such run" };
  if (!git(project, "rev-parse", "--is-inside-work-tree").ok) return { ok: false, why: "not a git repository" };
  const path = worktreeOf(project, id), branch = branchOf(id);
  if (existsSync(path)) return { ok: true, path, branch }; // already made: a resume
  if (!git(project, "remote").out) return { ok: false, why: "no git remote to branch from" };
  const f = git(project, "fetch", "origin");
  if (!f.ok) return { ok: false, why: `fetch failed: ${f.why}` };
  const base = `origin/${baseOf(project)}`;
  const exists = git(project, "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`).ok;
  const add = git(project, "worktree", "add", ...(exists ? [path, branch] : [path, "--no-track", "-b", branch, base]));
  if (!add.ok) return { ok: false, why: add.why };
  patchState(project, id, { worktree: path, branch });
  return { ok: true, path, branch };
}

export type Landed = { ok: true; how: "pr" | "push"; url?: string } | { ok: false; why: string };

// Whether every commit of the branch is on the base, by patch: a rebase-merge rewrites
// the hashes, so "is an ancestor" would say not landed for work that is.
const landed = (dir: string, base: string, branch: string) =>
  git(dir, "cherry", `origin/${base}`, branch).out.split("\n").every((l) => !l.startsWith("+"));

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
  const base = baseOf(project);
  const finish = (how: "pr" | "push", url?: string): Landed => {
    git(project, "fetch", "origin");
    if (!landed(dir, base, branch)) return { ok: false, why: `${how === "pr" ? "the pull request" : "the push"} went through but ${branch} is not on ${base} yet; worktree kept` };
    // The worktree is clean (checked above); --force is only for the untracked node_modules link.
    const rm = git(project, "worktree", "remove", "--force", dir);
    if (!rm.ok) return { ok: false, why: `landed, but the worktree stays: ${rm.why}` };
    git(project, "branch", "-D", branch);
    git(project, "push", "origin", "--delete", branch);
    patchState(project, id, { worktree: null, branch: null });
    return { ok: true, how, url };
  };

  const push = sh(["git", "push", "-u", "origin", branch], dir);
  if (!push.ok) return { ok: false, why: `push of ${branch} failed: ${push.why}` };

  if (hasGh) {
    const subject = git(dir, "log", "-1", "--format=%s").out;
    const pr = sh(["gh", "pr", "create", "--base", base, "--head", branch, "--title", subject, "--body", `Run ${id}.`], dir);
    // An existing pull request for the branch is fine: merge that one.
    const url = pr.ok ? pr.out.split("\n").pop() : undefined;
    if (!pr.ok && !/already exists/i.test(pr.why)) return { ok: false, why: `pull request failed: ${pr.why}; ${branch} is pushed` };
    const merge = sh(["gh", "pr", "merge", branch, "--rebase"], dir);
    if (!merge.ok) return { ok: false, why: `pull request not merged (${merge.why}); left open, worktree kept` };
    return finish("pr", url);
  }

  for (let i = 0; i < 2; i++) {
    const f = sh(["git", "fetch", "origin"], dir);
    if (!f.ok) return { ok: false, why: `fetch failed: ${f.why}` };
    const rb = sh(["git", "rebase", `origin/${base}`], dir);
    if (!rb.ok) { sh(["git", "rebase", "--abort"], dir); return { ok: false, why: `rebase onto ${base} conflicts: ${rb.why}; worktree kept` }; }
    if (sh(["git", "push", "origin", `HEAD:${base}`], dir).ok) return finish("push");
  }
  return { ok: false, why: `${base} kept moving; push rejected twice. Worktree kept` };
}
