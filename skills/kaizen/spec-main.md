# Kaizen — main thread

Read with [`spec.md`](spec.md) (core: track, intake, resume). Backlog bookkeeping and
the final approval. No subagent reads this file.

---
## Backlog

Every run produces work it deliberately does not do. Four sources, all already
written down by the time a run ends:

1. Out of scope suggestions the planner listed and the user did not fold into the
   approved scope.
2. Findings below `auto_fix.min_severity`, and findings the fix loop could not close.
3. Debts deferred at an approval because they fell outside the approved scope.
4. Criteria the reviewer answered `CANNOT VERIFY` that the user did not settle.

Without capture these survive only in the conversation that produced them.

`backlog.enabled: false` skips both capture points — the `02-approval.md` append at
plan approval and the `06-backlog.md` append at final approval — for that run. The run
still executes normally; it simply ends without a backlog file.

**Where it lives.** Each run holds its own backlog at `runs/<id>/06-backlog.md`, beside
the plan and the review that produced the items. There is no central backlog file to
keep in sync, and no copying: provenance is the directory the item sits in.

`<state.dir>/backlog.md`, beside `memory.md`, exists for exactly one purpose — an
orphanage. Before `state.keep_runs` prunes a run directory, that run's **open** items
are moved into it, so pruning never destroys outstanding work. Items already `done` or
`rejected` are pruned with their run. Nothing else is ever written there, and
`06-backlog.md` is never replaced by it.

**Pruning is the CLI's job, never a stage's.** `kaizen prune` in a terminal lists the
finished runs beyond `state.keep_runs`, and `kaizen prune --yes` rescues their open
items and deletes them. No agent deletes a run directory by hand: when the count is
over the limit, say so at the final report and name the command.

`/kaizen backlog` reads `<state.dir>/backlog.md` as well as every
`runs/*/06-backlog.md`, and prints its open items last, under an **Orphaned** group —
otherwise a rescued item would be invisible to the only command that lists outstanding
work. Orphaned items count towards the open backlog count `/kaizen status` reports.

An abandoned run — `stage: "abandoned"`, set by `/kaizen abort` — is not open work. Its
`06-backlog.md` is left as it stands, and its items are neither printed by `/kaizen
backlog` nor counted.

**Item format.** One item per line:

```
- <status>: <item text> | <reason>
```

`<status>` is `open`, `done`, or `rejected`. A finding moved into the backlog keeps the
reviewer's line verbatim — `<where>: <severity>: <problem>. <fix>.` — so nothing is
rewritten in transit. `rejected` requires a reason after `|` on the same line; "not
doing this" with no reason is how the same suggestion returns three runs later. `done`
may carry a reason the same way, and usually names the run that closed it.

Items are appended, never deleted. Closing an item means editing its status in place;
it stays in its run's file as record. `/kaizen backlog` prints `open` items only, so
the active list is bounded by what is genuinely outstanding rather than by history.

Because a `<where>` reference must still resolve after its run closes, it is written as
a path relative to the repository, not to the run directory.

**Who writes it.** The main thread, at two file writes that already happen
unconditionally:

| Capture point | Stage | What gets appended |
|---|---|---|
| Writing `02-approval.md`, when the decision is an approval | Plan approval | Every out-of-scope suggestion not folded into the approved scope, and anything cut from scope at the approval |
| Setting `stage: "done"` | Final approval | Findings still open, findings below the fix threshold, and out-of-scope notes the builder wrote into `03-impl.md` |

Neither is optional and neither is a separate step to remember — a run cannot finish
without touching both files.

No subagent writes the backlog. The reviewer runs *before* the fix loop and cannot know
which of its findings will be closed; it would log items that get fixed minutes later.
The planner is not present at the approval where its suggestions are accepted or
declined. This also keeps the workflow working under adapters where there are no
subagents at all.

---

## Preview gate

Before setting `stage: "review"` after a build, in either runner, open `03-impl.md` and
check its `## Preview`: it has `### How to test` steps, and — when the result shows on a
screen — at least one `![…](attachments/<name>.png)` embed whose file exists under
`runs/<id>/attachments/`. A result with no screen needs one line under `## Preview`
saying why there is no screenshot; "no headless browser" for a result that shows on a
screen does not count — take it as missing. Anything missing means the build is not finished:
under `lite`, take the screenshot and write the section now; under `full`, send the
builder back to add it. Then advance. This is the step that keeps the board's Preview
tab from staying empty; the reviewer flagging it later is a second net, not the first.

---

## Docs gate

Before a run can be `done` — in every runner and every mode, `auto` included — bring
the project's docs vault up to date with what the run changed. Apply it once the review
is settled and before the final approval report, so the user approves the notes with
the work; where the user's answer sends findings back to be fixed, apply it again over
those fixes before setting `stage: "done"`. In a run with a `worktree`, edit the notes
in the worktree, where the vault is committed with the code. Where
`notes/Project/Index.md` does not exist in the state directory, there is no vault and
nothing to do. The builder already updates the notes it can see during the build; this
is the step that catches what it could not: fix iterations after it, and changes no
note covers.

1. **What changed:** every path named in `03-impl.md` and in each
   `05-iterations/*-fix.md`, leaving out `.kaizen/` itself.
2. **Covered:** for each note whose `sources` include one of those paths (a folder in
   `sources` covers everything under it), check the note against the changed files.
   Where the change made it untrue or left something out, correct it as *Keep the
   project's docs vault current* in [`spec-build.md`](spec-build.md) says — never the
   `## Notes` section — set `updated` to today, and append the `Log.md` line, unless the
   builder already wrote this run's line, in which case add the notes to it.
3. **Not covered:** a changed path no note's `sources` reach. Add it to the `sources`
   of the note whose area it belongs to and describe it there; where it belongs to no
   area, write a note for it as step 4 of *Update* in [`docs.md`](docs.md) says and
   list it in `Index.md`. A path that is not part of the project's material — a lock
   file, a generated bundle — needs no note.
4. **Lint** the notes touched, as *Lint* in [`docs.md`](docs.md) lists, and fix what
   this run broke.

Name the notes touched in the final report; the commit at done includes them. A run
whose changes leave every note true touches nothing and says so in one line.

---

## Final approval

Controlled by `approvals.review`, skipped in `auto`.

Report: what was built (for a code run, show its Preview proof), verification results, findings fixed, findings still open,
every criterion the reviewer answered `CANNOT VERIFY` with the check it says a human
must make, anything the builder noted as out of scope, and the notes the *Docs gate*
touched. Where the run used `runner: lite`, say
so in that report — the reviewer saw the work, and nobody should read a same-session
review as an independent one because the output looked the same.
Later build requests in the same session follow *Follow-ups are runs too* in [`spec.md`](spec.md): a revise of this run until it is `done`, then a new linked run.
Then stop. Committing, pushing, or
opening a pull request happens only if the user asks; the board's Approve button is that ask for commit and push, and its prompt says so.
For a run with a `worktree` in `state.json`, that ask means: commit in the worktree, then
`kaizen worktree land` with the run id, from the project folder,. It pushes `kaizen/<id>`, opens a pull
request and rebase-merges it when GitHub says it is clean (without `gh`: a rebase onto
the default branch and a push, tried twice), and removes the worktree and branch only
once the default branch holds the work. A conflict or an unmerged pull request leaves
everything in place: report its message as printed and let the user decide. The run is
`done` once approved; whether the work landed is reported, not hidden.

**Open findings are offered by number.** List them with the reviewer's numbering
intact and let the user name which to fix — "fix 2 and 5". A number not named is not
touched, and goes to the backlog as `open` like any other deferred item. This is the
same granularity the fix loop already works at; the only change is that the user
picks the subset instead of accepting or declining the whole review.

Before setting `stage: "done"`, append the same categories just reported — findings
still open, findings below the fix threshold, `CANNOT VERIFY` criteria the user did
not settle, and the builder's out-of-scope notes from `03-impl.md` — to `runs/<id>/06-backlog.md`, each as `open`, in the format
given in *Backlog* above. Every input is already assembled at this moment; the only
change is that it is written down rather than spoken and discarded.

Set `stage: "done"` in `state.json` once the user accepts.

**Commit at done, when `git.auto_commit` is `true`.** Setting `stage: "done"` — the
user approving at review, or an `auto` run finishing — is then the ask to commit, under
either runner. Commit only the files this run changed (the paths `03-impl.md` names
and the notes the *Docs gate* touched, that `git status` shows changed), by path:
`git add -A -- <paths>` then `git commit -m <message> -- <paths>`, never the whole
tree, since other sessions edit the same checkout. The message is `03-impl.md`'s `## Commit`. In a run with a
`worktree`, commit there. Then write `runs/<id>/07-commit.md` as `commit: <short sha>`
and `pushed: no`, so the board shows it committed and offers the push. Never push. A
failed commit is reported as printed; the run is still `done`. With the setting
`false`, nothing is committed unless the user asks.

---

## Child cards

A run may file new work as its own card instead of growing its scope — under either
runner. Under `full`, subagents only suggest it in their report; the main thread files it,
from the project folder: `kaizen card add "<the work, one line>"`. It links the card to
the run in flight (`--parent <run id>` names another), and the link follows the card into
the run it becomes. The board shows the parent's name on the child.

When a child run reaches `done`, the board appends `Child <child id> done: <title>` to
the parent's `notes.md` by itself. The parent documents it from there: if it is still in
flight its next stage reads `notes.md`; if it is already `done`, the entry is the record.
Never reopen a finished parent.
