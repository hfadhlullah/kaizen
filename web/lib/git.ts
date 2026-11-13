// The Source control tab's rules without the screen: which steps exist and why one is unavailable, what the main
// button does, and what the empty tab says. The tab draws what these return (components/git-tab.tsx).
export type GitRow = { path: string; staged: boolean; code: string; add: number; del: number };
export type GitLog = { sha: string; subject: string; unpushed?: boolean };
export type GitDoc = {
  repo: boolean;
  branch?: string;
  remote?: string;
  files: string[];
  ahead: number;
  others?: number;
  shared?: string[];
  rows?: GitRow[];
  staged?: string[];
  log?: GitLog[];
};
export type Pr = { number: number; state: "OPEN" | "MERGED" | "CLOSED"; draft?: boolean; url: string };
export type BranchDoc = {
  branch: string;
  base: string;
  local: boolean;
  upstream: boolean;
  landed: boolean;
  gh: boolean;
  checking?: boolean;
  pr: Pr | null;
};
export type StepId = "commit" | "commitpush" | "push" | "pr" | "draft" | "merge" | "remove";
export type Step = { a: StepId; label: string; why: string };

// Every step, in the order the main button walks them. `why` is set when the step is unavailable; the menu shows it
// under the label. A run with no worktree (b is null) only commits and pushes.
export function steps(g: GitDoc, b: BranchDoc | null): Step[] {
  const pr = b?.pr,
    files = g.files.length,
    staged = (g.staged ?? []).length,
    open = pr?.state === "OPEN";
  const s: Step[] = [
    { a: "commit", label: "Commit", why: staged ? "" : files ? "Stage changes first" : "No changes to commit" },
    { a: "commitpush", label: "Commit & push", why: files ? "" : "No changes to commit" },
    {
      a: "push",
      label: "Push",
      why: files
        ? "Commit changes first"
        : b && !b.upstream
          ? b.local
            ? "Lands by local merge: kaizen worktree land"
            : "Not published yet: Create PR pushes it"
          : g.ahead > 0
            ? ""
            : "Nothing to push",
    },
  ];
  if (!b) return s;
  const noGh = b.local
    ? "Lands by local merge: kaizen worktree land"
    : b.gh
      ? ""
      : "Needs the GitHub CLI (gh) and a GitHub remote";
  const prWhy =
    noGh ||
    (files
      ? "Commit changes first"
      : pr && pr.state !== "CLOSED"
        ? `Pull request #${pr.number} is ${pr.state === "MERGED" ? "merged" : "open"}`
        : "");
  s.push(
    { a: "pr", label: b.upstream && g.ahead === 0 ? "Create PR" : "Push & create PR", why: prWhy },
    { a: "draft", label: "Create draft PR", why: prWhy },
    {
      a: "merge",
      label: "Merge PR",
      why:
        noGh ||
        (!open
          ? "No open pull request"
          : pr!.draft
            ? "Draft: mark it ready on GitHub first"
            : files
              ? "Commit changes first"
              : g.ahead > 0
                ? "Push first"
                : ""),
    },
    {
      a: "remove",
      label: "Remove workspace",
      why: files ? "Commit or discard the changes first" : b.landed ? "" : "Merge the pull request first",
    },
  );
  return s;
}

export type MainStep = { a: StepId | "stageall" | ""; label: string; icon: "check" | "plus" | "" };
// The main button: Stage all while nothing is staged, Commit once something is, else the next remote step (push, PR,
// merge, remove), else a Commit with nothing to do.
export function mainStep(all: Step[], staged: number, unstaged: number): MainStep {
  const later = all.find((x) => !x.why && !["commit", "commitpush", "draft"].includes(x.a));
  return staged
    ? { a: "commit", label: "Commit", icon: "check" }
    : unstaged
      ? { a: "stageall", label: "Stage all", icon: "plus" }
      : later
        ? { a: later.a, label: later.label, icon: "" }
        : { a: "", label: "Commit", icon: "check" };
}

export const targetOf = (g: GitDoc, b: BranchDoc | null) =>
  b ? (b.local ? b.base : `origin/${b.base}`) : `${g.remote}/${g.branch || "HEAD"}`;

// What the tab says when no file is left to commit: a head and one line.
export function emptyNote(g: GitDoc, b: BranchDoc | null): { head: string; body: string } {
  const pr = b?.pr,
    target = targetOf(g, b),
    ahead = g.ahead > 0 && (!b || b.upstream);
  return {
    head:
      pr?.state === "MERGED"
        ? "Merged"
        : b?.landed
          ? "On " + b.base
          : ahead
            ? "Not pushed yet"
            : "No changes on this branch",
    body:
      pr?.state === "MERGED"
        ? `Pull request #${pr.number} is merged into ${b!.base}. The worktree and its branch can go.`
        : b?.landed
          ? `Every commit of ${b.branch} is on ${b.base}. The worktree can go.`
          : ahead
            ? `${g.ahead} commit${g.ahead === 1 ? "" : "s"} ahead of ${target}.`
            : b && !b.upstream
              ? `${b.branch} is not on GitHub yet. Create PR pushes it.`
              : `This workspace is clean and has no changes ahead of ${target}.`,
  };
}

// What the totals' tooltip says: files that are other runs', which Orca's panel has no room for.
export const asideOf = (g: GitDoc) =>
  [
    g.others ? `${g.others} other changed file${g.others === 1 ? " is" : "s are"} not this run's` : "",
    ...(g.shared?.length ? [`Also holds other runs' changes: ${g.shared.map((x) => x.split(":")[0]).join(", ")}`] : []),
  ]
    .filter(Boolean)
    .join("\n");

export const sumRows = (rows: GitRow[]): [number, number] =>
  rows.reduce<[number, number]>((t, r) => [t[0] + r.add, t[1] + r.del], [0, 0]);
export const PR_WORD: Record<string, string> = { OPEN: "Open", MERGED: "Merged", CLOSED: "Closed" };
export const BUSY: Record<string, string> = {
  commit: "Committing…",
  commitpush: "Pushing…",
  push: "Pushing…",
  "go-pr": "Creating PR…",
  "go-draft": "Creating PR…",
  "go-merge": "Merging…",
  "go-remove": "Removing…",
};
// The toast a finished step says.
export const DONE = (a: string, r: { sha?: string; pr?: { number: number } }) =>
  a === "commit"
    ? "Committed " + r.sha
    : a === "commitpush" || a === "push"
      ? "Committed & pushed " + r.sha
      : a === "go-merge"
        ? "Merged"
        : a === "go-remove"
          ? "Worktree removed"
          : "Pull request #" + r.pr?.number + " opened";
