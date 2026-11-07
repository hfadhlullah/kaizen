---
description: Source control tab: commit, push, PRs, which files are a run's, and landing
tags: [project, web-board]
sources: [cli/worktree.ts, cli/state.ts, web/board]
updated: 2026-11-07
---
# Git and landing

Part of [[Web board]].

## In plain words
How the board commits, pushes and opens pull requests for a run, which files count as a run's own, and how a run's branch is landed back on main.

## Where it lives
- A run's files on Source control: `runReport()` keeps `named`, `03-impl.md` and each fix report without the sections `NOT_CHANGES` matches (Deviations, Verification, Preview, Commit, Left unchanged and the like), cut per file, and `owns()` reads that, so a path only mentioned there is not offered; a section with any other name still counts. This is the report's word, not a diff: a shared checkout has no per-run diff.

## Watch out
- Commit & push stages the whole working tree, and runs commit the paths backticked in `03-impl.md` (`runGit()`; `.kaizen/memory.md`).

- The run panel's Source control tab (`web/board/git.ts`, `gitTab`; tab key `git`, icon `#t-git`) holds every git step, laid out after Orca's Source Control panel: PR chip, branch with +/- → target, message, a split button whose primary is Stage all → Commit (index only, no push) → the first available of Push → Create PR → Merge PR → Remove workspace; its menu (`steps()`, each unavailable one with a `why`) adds Commit & push. Staged changes / Changes list `runGit().rows` with hover Stage/Unstage/Discard (`POST /stage`, `stageFiles`: run-owned paths only; discard confirms in a modal). Commits at the foot come from `branchLog`. The sparkle in the message box calls `POST /commit-message` (`suggestMessage`: headless `claude -p`, tools off, diff as data; falls back to `chore: update <files>`). Changes has Discard all and Stage all in its header. Plain Commit is `/commit` with `push:false` (`commitStaged`, refused when the index holds files that are not the run's). The footer has only a `Source control` button that opens the tab while `gitPending()`. `/run/<id>` carries `branch` (`branchState` in `cli/worktree.ts`, null for a run with no worktree); its PR comes from a background `gh pr view` cached 30 s per run (`prs`, `looking`), which calls `changed()` when it lands, so `/run` never waits on GitHub. `/pr` (`op: create|merge|remove`) takes `/commit`'s guards plus the final-approval gate for create and merge; `openPr` pushes `-u` then `gh pr create` (title and body as separate argv), `mergePr` is `gh pr merge <branch> --rebase` then a fetch, `removeWorktree` refuses a dirty worktree or any commit not on the base by `git cherry`, then `worktree remove --force`, `branch -D`, remote delete best-effort, and clears `worktree`/`branch` in state.json. Tests: `cli/worktree.test.ts` (Git tab block), `cli/web-pr.test.ts`.

- Preflight on the Git tab: `/pr` create and merge, and `/commit` with push for a run with no worktree (it pushes the project's own branch), run `gatePreflight` in `cli/web.ts` first. A stop returns 409 `{ preflight: { issues, notes, base, branch }, token }` with a one-time token per run and step (`preflights` map); a resend with `override: <token>` goes on and records `go ahead (user)`. A made-up, reused or other-step token runs the check again. The page (`web/board/git.ts` `confirmPreflight`) shows the findings in the `.gdis` confirm with *Go ahead anyway*. `body.runv .btn:not(.pri):not(.ghost)` made `.gdis .btn.danger` transparent with white text in the run view (Discard too); `web/board.html` now names `body.runv .gdis .btn.danger:not(.pri)`.

- A run with a recorded commit no longer claims a file edited after that commit (`runFiles`), and `cardsGit` judges a worktree run in its worktree, not the project folder.

- What counts as a run's for Commit & push and the card's git mark is judged per run (`runGit` / `cardsGit`): a changed file is its only when its report is newer than the file's last commit (so a run committed by its agent is not offered edits other sessions made since), and it is ahead only by its own unpushed commits (`aheadBy`): each commit goes to one run — first by a unique SHA prefix recorded in `07-commit.md`, then by the report's commit subject as a line, else by the report naming most of its files, then by the last report — not by the branch being ahead.

- A card field that needs git is added in the `/state` route (`cardsGit` in `cli/state.ts`), not in `boardCards()`: the terminal board calls `boardCards()` on every tick and its card order is pinned by a test. `cardsGit` and `gitBtn` in `web/board.html` hold the same rules twice; change both.

- Board git marks are per run (`runGit`/`cardsGit`): a file committed after the run's report is no longer the run's, and `ahead` counts only the unpushed commits `aheadBy` gives the run (subject line in its report, else most files named). A test that checks Push/pending must pin commit times (`GIT_COMMITTER_DATE`) and report mtimes, since the rule compares them.

A land rebases first, resolves only `git.generated` paths, runs `git.land_check` after pulled commits, and records a failure in `runs/<id>/land.json`. The board reads it as the card's `land` and each agent's `land`, showing `Conflict` or `Land failed` with a red `!`.
