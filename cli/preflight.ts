// `kaizen preflight <run-id>`: the look at the rest of the repo before kaizen pushes to a
// base branch or merges into it. It reports and never acts: no rebase, merge, push or close.
// Stops (clean: false) on: the branch behind its base, this landing's CI failed or still
// running, the base's CI failed, or another open PR / unmerged branch / run in flight that
// changes the same files. What it cannot check (no remote, no gh, offline) is a note, never
// a stop. Files matched by `git.generated` (the web bundles) are a note too: a land rebuilds them.
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runGit } from "./state.ts";
import { baseOfRun, branchFor, codeDir, generatedOf, localBase, onGithub, run, runAsync, type AsyncRun, type Out, type Run } from "./worktree.ts";

export type Issue = { kind: "behind" | "ci-failed" | "ci-running" | "base-failed" | "pr-overlap" | "branch-overlap"; what: string; files?: string[] };
export type Preflight = { clean: boolean; issues: Issue[]; notes: string[]; files: string[]; base: string; branch: string };

// ponytail: 20 PRs and 20 branches, each a git or gh call; a repo with more says so in a note.
const CAP = 20;
const GH_MS = 20_000;
const SLUG = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*$/;

const lines = (o: Out) => (o.ok ? o.out.split("\n").map((l) => l.trim()).filter(Boolean) : []);
// gh can hang on a slow network; past GH_MS its answer is a note, not a wait.
const timed = (p: Promise<Out>): Promise<Out> =>
  Promise.race([p, new Promise<Out>((r) => setTimeout(() => r({ ok: false, out: "", why: "timed out" }), GH_MS))]);
const json = (o: Out): any => { try { return o.ok ? JSON.parse(o.out) : null; } catch { return null; } };

// A check list from `gh pr view --json statusCheckRollup` or `gh run list`: failed, running, or fine.
function ciState(checks: any[]): "failed" | "running" | "ok" | "none" {
  if (!Array.isArray(checks) || !checks.length) return "none";
  let running = false;
  for (const c of checks) {
    const done = String(c.conclusion ?? c.state ?? "").toUpperCase(), st = String(c.status ?? "").toUpperCase();
    if (/^(FAILURE|FAILED|ERROR|CANCELLED|TIMED_OUT|ACTION_REQUIRED|STARTUP_FAILURE)$/.test(done)) return "failed";
    if (/^(IN_PROGRESS|QUEUED|PENDING|WAITING|REQUESTED|EXPECTED)$/.test(st) || done === "PENDING" || (!done && st !== "COMPLETED")) running = true;
  }
  return running ? "running" : "ok";
}

export async function preflight(project: string, id: string, o: { extraFiles?: string[]; sh?: Run; ash?: AsyncRun; hasGh?: boolean } = {}): Promise<Preflight> {
  const sh = o.sh ?? run, ash = o.ash ?? runAsync;
  const dir = codeDir(project, id), own = dir !== project;
  const here = sh(["git", "symbolic-ref", "--short", "-q", "HEAD"], dir).out;
  const branch = own ? branchFor(project, id) : here;
  const base = baseOfRun(project, id);
  const done = (notes: string[], issues: Issue[] = [], files: string[] = []): Preflight => ({ clean: !issues.length, issues, notes, files, base, branch });
  if (localBase(project, id)) return done([`lands by a local merge into ${base}: nothing is pushed`]);
  if (!lines(sh(["git", "remote"], project)).includes("origin")) return done(["no remote: nothing to compare"]);

  const notes: string[] = [], issues: Issue[] = [];
  if (!(await ash(["git", "fetch", "-q", "origin"], project)).ok) notes.push("offline: compared with the last fetch");
  const baseRef = `origin/${base}`;
  if (!sh(["git", "rev-parse", "--verify", "--quiet", `refs/remotes/${baseRef}`], project).ok) return done([...notes, `the remote has no ${base} yet: nothing to compare`]);

  const behind = Number(sh(["git", "rev-list", "--count", `HEAD..${baseRef}`], dir).out) || 0;
  if (behind > 0) issues.push({ kind: "behind", what: `${branch || "HEAD"} is ${behind} commit${behind === 1 ? "" : "s"} behind ${baseRef}: rebase first` });

  const gen = generatedOf(project);
  // What this land carries: its commits not on the base, plus, for a run with no worktree
  // (it commits and pushes in the project folder), the run's own changed files not yet committed.
  const pending = own ? [] : (() => { try { return runGit(join(project, ".kaizen"), id).rows?.map((r) => r.path) ?? []; } catch { return []; } })();
  const files = [...new Set([...lines(sh(["git", "diff", "--name-only", `${baseRef}...HEAD`], dir)), ...pending, ...(o.extraFiles ?? [])])].sort();
  const mine = new Set(files);
  const genTouched = new Set<string>();
  // The files another piece of work shares with this landing; generated ones only noted.
  const shared = (theirs: string[]) => {
    const both = theirs.filter((f) => mine.has(f));
    both.filter(gen).forEach((f) => genTouched.add(f));
    return both.filter((f) => !gen(f));
  };

  const gh = o.hasGh ?? onGithub(project);
  const skip = new Set<string>(); // branches already compared as an open PR
  const direct = !own && branch === base; // the board's Commit & push on the base itself
  const [view, baseRuns, open] = gh
    ? await Promise.all([
        direct ? Promise.resolve(null) : timed(ash(["gh", "pr", "view", branch, "--json", "number,statusCheckRollup"], project)),
        timed(ash(["gh", "run", "list", "--branch", base, "--limit", "1", "--json", "status,conclusion,name"], project)),
        timed(ash(["gh", "pr", "list", "--state", "open", "--base", base, "--limit", String(CAP + 1), "--json", "number,title,headRefName,files"], project)),
      ])
    : [null, null, null];
  if (!gh) notes.push("CI and open pull requests not checked: needs gh and a GitHub remote");

  if (gh) {
    const pr = view && json(view);
    if (!direct && !pr) notes.push(`no pull request for ${branch} yet: its CI is checked once it has one`);
    const ci = pr ? ciState(pr.statusCheckRollup) : "none";
    if (ci === "failed") issues.push({ kind: "ci-failed", what: `CI failed on #${pr.number}` });
    if (ci === "running") issues.push({ kind: "ci-running", what: `CI is still running on #${pr.number}` });
    const last = baseRuns && json(baseRuns);
    if (baseRuns && !baseRuns.ok) notes.push(`${base}'s CI not checked: ${baseRuns.why}`);
    const bci = Array.isArray(last) ? ciState(last) : "none";
    if (bci === "failed") issues.push({ kind: "base-failed", what: `${base}'s last CI run failed` });
    if (bci === "running" && direct) issues.push({ kind: "ci-running", what: `${base}'s CI is still running` });
    const prs: any[] = (open && json(open)) || [];
    if (open && !open.ok) notes.push(`open pull requests not checked: ${open.why}`);
    if (prs.length > CAP) notes.push(`more than ${CAP} open pull requests: only the first ${CAP} were compared`);
    for (const p of prs.slice(0, CAP)) {
      if (p.headRefName === branch) continue;
      const both = shared((p.files ?? []).map((f: any) => String(f.path)));
      if (both.length) issues.push({ kind: "pr-overlap", what: `#${p.number} ${p.headRefName} (${String(p.title).slice(0, 60)}) also changes ${both.length} of these files`, files: both });
    }
    prs.forEach((p) => skip.add(`origin/${p.headRefName}`));
  }

  // Unmerged remote branches, and the branches of runs still in flight; an open PR's branch was compared above.
  const refs = lines(sh(["git", "for-each-ref", "refs/remotes/origin", "--format=%(refname:short)"], project))
    .filter((r) => r !== "origin" && r !== "origin/HEAD" && r !== baseRef && r !== `origin/${branch}` && !skip.has(r));
  const runs = inFlight(project, id).filter((b) => b !== branch && !refs.includes(`origin/${b}`) && !skip.has(`origin/${b}`));
  const all = [...refs, ...runs];
  if (all.length > CAP) notes.push(`more than ${CAP} other branches: only the first ${CAP} were compared`);
  for (const ref of all.slice(0, CAP)) {
    const cherry = sh(["git", "cherry", baseRef, ref], project);
    if (!cherry.ok || !cherry.out.split("\n").some((l) => l.startsWith("+"))) continue; // merged, or unreadable
    const both = shared(lines(sh(["git", "diff", "--name-only", `${baseRef}...${ref}`], project)));
    if (both.length) issues.push({ kind: "branch-overlap", what: `${ref.replace(/^origin\//, "")} (not merged) also changes ${both.length} of these files`, files: both });
  }
  if (genTouched.size) notes.push(`other work also changes generated files (${[...genTouched].join(", ")}): a land rebuilds them`);
  return done([...notes], issues, files);
}
// Local branches of other runs whose stage is still open and that have a worktree.
function inFlight(project: string, id: string): string[] {
  const dir = join(project, ".kaizen", "runs");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((r) => r !== id && SLUG.test(r)).flatMap((r) => {
    try {
      const s = JSON.parse(readFileSync(join(dir, r, "state.json"), "utf8"));
      return s.stage !== "done" && s.stage !== "abandoned" && s.worktree && typeof s.branch === "string" ? [s.branch] : [];
    } catch { return []; }
  });
}

/** The report as plain lines, for the terminal and for `preflight.md`. */
export function report(p: Preflight): string {
  const out = [`${p.clean ? "clean" : "stopped"}: ${p.branch || "HEAD"} → ${p.base}`];
  for (const i of p.issues) out.push(`- ${i.what}${i.files ? `: ${i.files.slice(0, 8).join(", ")}${i.files.length > 8 ? `, +${i.files.length - 8} more` : ""}` : ""}`);
  for (const n of p.notes) out.push(`  note: ${n}`);
  return out.join("\n");
}

/** `runs/<id>/preflight.md`: what was found and what was decided, appended per land. */
export function writePreflight(project: string, id: string, p: Preflight, decision: "clean" | "go ahead (user)" | "stopped") {
  if (!SLUG.test(id)) return;
  const f = join(project, ".kaizen", "runs", id, "preflight.md");
  if (!existsSync(join(project, ".kaizen", "runs", id))) return;
  let prev = "";
  try { prev = readFileSync(f, "utf8"); } catch { prev = "# Preflight\n"; }
  const tmp = `${f}.${process.pid}.tmp`;
  writeFileSync(tmp, `${prev.trimEnd()}\n\n## ${new Date().toISOString()}\ndecision: ${decision}\n\n${report(p)}\n`);
  renameSync(tmp, f);
}
