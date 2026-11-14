import { expect, test } from "bun:test";
import {
  DONE,
  asideOf,
  emptyNote,
  mainStep,
  steps,
  sumRows,
  targetOf,
  type BranchDoc,
  type GitDoc,
} from "./lib/git.ts";

const g = (o: Partial<GitDoc> = {}): GitDoc => ({
  repo: true,
  files: [],
  ahead: 0,
  branch: "main",
  remote: "origin",
  ...o,
});
const b = (o: Partial<BranchDoc> = {}): BranchDoc => ({
  branch: "kaizen/x",
  base: "main",
  local: false,
  upstream: true,
  landed: false,
  gh: true,
  pr: null,
  ...o,
});
const why = (all: ReturnType<typeof steps>) => Object.fromEntries(all.map((s) => [s.a, s.why]));

test("a run with no worktree only commits and pushes, each step saying why it is off", () => {
  expect(why(steps(g({ files: [" M a"] }), null))).toEqual({
    commit: "Stage changes first",
    commitpush: "",
    push: "Commit changes first",
  });
  expect(why(steps(g({ files: [" M a"], staged: ["a"] }), null)).commit).toBe("");
  expect(why(steps(g(), null))).toEqual({
    commit: "No changes to commit",
    commitpush: "No changes to commit",
    push: "Nothing to push",
  });
  expect(why(steps(g({ ahead: 2 }), null)).push).toBe("");
});
test("a worktree run adds the pull request steps, with the reason each is off", () => {
  const clean = why(steps(g({ ahead: 1 }), b()));
  expect(clean).toMatchObject({
    pr: "",
    draft: "",
    merge: "No open pull request",
    remove: "Merge the pull request first",
  });
  expect(steps(g({ ahead: 1 }), b()).find((s) => s.a === "pr")!.label).toBe("Push & create PR");
  expect(steps(g(), b()).find((s) => s.a === "pr")!.label).toBe("Create PR");
  const open = b({ pr: { number: 7, state: "OPEN", url: "u" } });
  expect(why(steps(g(), open))).toMatchObject({ pr: "Pull request #7 is open", merge: "" });
  expect(why(steps(g({ ahead: 1 }), open)).merge).toBe("Push first");
  expect(why(steps(g({ files: [" M a"] }), open))).toMatchObject({
    merge: "Commit changes first",
    remove: "Commit or discard the changes first",
  });
  expect(why(steps(g(), b({ pr: { number: 7, state: "OPEN", draft: true, url: "u" } }))).merge).toBe(
    "Draft: mark it ready on GitHub first",
  );
  expect(why(steps(g(), b({ landed: true, pr: { number: 7, state: "MERGED", url: "u" } }))).remove).toBe("");
});
test("without gh or with a local merge the pull request steps explain themselves", () => {
  expect(why(steps(g(), b({ gh: false }))).pr).toBe("Needs the GitHub CLI (gh) and a GitHub remote");
  expect(why(steps(g(), b({ local: true, upstream: false }))).push).toBe("Lands by local merge: kaizen worktree land");
  expect(why(steps(g(), b({ upstream: false }))).push).toBe("Not published yet: Create PR pushes it");
});
test("the main button walks stage all, commit, then the next remote step", () => {
  const all = steps(g({ ahead: 1 }), b());
  expect(mainStep(all, 0, 2)).toEqual({ a: "stageall", label: "Stage all", icon: "plus" });
  expect(mainStep(steps(g({ files: [" M a"], staged: ["a"] }), b()), 1, 0)).toEqual({
    a: "commit",
    label: "Commit",
    icon: "check",
  });
  expect(mainStep(all, 0, 0)).toEqual({ a: "push", label: "Push", icon: "" });
  expect(mainStep(steps(g(), b()), 0, 0)).toEqual({ a: "pr", label: "Create PR", icon: "" });
  expect(mainStep(steps(g(), null), 0, 0)).toEqual({ a: "", label: "Commit", icon: "check" });
});
test("the empty tab says where the branch stands", () => {
  expect(emptyNote(g(), null)).toEqual({
    head: "No changes on this branch",
    body: "This workspace is clean and has no changes ahead of origin/main.",
  });
  expect(emptyNote(g({ ahead: 1 }), null)).toEqual({ head: "Not pushed yet", body: "1 commit ahead of origin/main." });
  expect(emptyNote(g({ ahead: 3 }), b()).body).toBe("3 commits ahead of origin/main.");
  expect(emptyNote(g(), b({ upstream: false })).body).toBe("kaizen/x is not on GitHub yet. Create PR pushes it.");
  expect(emptyNote(g(), b({ landed: true })).head).toBe("On main");
  expect(emptyNote(g(), b({ pr: { number: 7, state: "MERGED", url: "u" } })).body).toBe(
    "Pull request #7 is merged into main. The worktree and its branch can go.",
  );
});
test("totals, target and the other-runs note", () => {
  expect(
    sumRows([
      { path: "a", staged: false, code: "M", add: 3, del: 1 },
      { path: "b", staged: true, code: "A", add: 2, del: 0 },
    ]),
  ).toEqual([5, 1]);
  expect(targetOf(g(), null)).toBe("origin/main");
  expect(targetOf(g(), b({ local: true }))).toBe("main");
  expect(asideOf(g({ others: 2, shared: ["src/a.ts: run-1"] }))).toBe(
    "2 other changed files are not this run's\nAlso holds other runs' changes: src/a.ts",
  );
});
test("what a finished step says", () => {
  expect(DONE("commit", { sha: "abc" })).toBe("Committed abc");
  expect(DONE("push", { sha: "abc" })).toBe("Committed & pushed abc");
  expect(DONE("go-pr", { pr: { number: 9 } })).toBe("Pull request #9 opened");
  expect(DONE("go-merge", {})).toBe("Merged");
});
