# Kaizen — main thread

Read with [`spec.md`](spec.md) (core: track, intake, resume). Backlog bookkeeping and
the final approval. No subagent reads this file.

---
## Backlog

The backlog holds only what the user asked to put there. Nothing is filed because it
was left over: findings still open after the fix loop, `CANNOT VERIFY` criteria,
planner suggestions and builder notes are reported at the approval, and each goes to
the backlog only when the user says so. What the user does not name stays in
`04-review.md` or the plan as record, not as open work. In `auto` mode nobody is asked,
so nothing is filed. Asking counts only in the user's own words naming the item ("do
X next run", "backlog 5"); a bare approve files nothing. When unsure, ask once; do not
file to be safe.

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
| Writing `02-approval.md`, when the decision is an approval | Plan approval | Only items the user asked to backlog |
| Setting `stage: "done"` | Final approval | Only items the user asked to backlog, not already recorded |

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
4. **Lint:** run `kaizen docs lint` from the project or worktree. It checks the whole
   vault and exits nonzero on findings. Fix findings this run introduced before the
   final report, and report any pre-existing findings with the command output. Run it
   again after any later fix round before setting `stage: "done"`.

Name the notes touched in the final report; the commit at done includes them. A run
whose changes leave every note true touches nothing and says so in one line.

---

## Final approval

Controlled by `approvals.review`. `auto` skips every stop before it, not this one, unless `auto_accept` is on.

**The gate is a stop, in every runner.** With `approvals.review` on, a run whose
`03-impl.md` names changed files is not done until `02-approval.md` holds an
acceptance line, exactly one of:

```
accepted: <ISO 8601 time> by user via board
accepted: <ISO 8601 time> by user via chat
accepted: <ISO 8601 time> auto (auto_accept)
```

The review ends by writing `stage: "review"`, `awaiting: "approvals.review"` and
stopping; never write `stage: "done"` in the same step as the review, and never from
`plan` or `build`. The board's Approve writes the `via board` line itself. On
`/kaizen approve` or a clear approval of this run in conversation ("approve", "looks
good, ship it"), finish with `kaizen done <id> --user-approved`, which appends the `via chat`
line and sets `done`. Without the user's yes run plain `kaizen done <id>`: it refuses and
tells you to ask. kaizen reads and rewrites a gate-on run marked `done` without the
`accepted:` line back to `review` / `approvals.review`, so setting `done` early only gets
it undone. The flag stops forgetting and shortcuts, not forgery. A request that only
names a later step, such as "commit and push", is not one: ask once whether it
approves the run. In `auto` mode the run stops there too ("finished, waiting for your
approval"), unless `auto_accept` is `true`: then append the `auto (auto_accept)` line
and set `done`. A run that changed no files, or runs with `approvals.review` off, may
go `done` without the line. A run marked `done` without it shows on the board as
"done, not approved", and its commit is refused until it is approved.

Report: what was built (for a code run, show its Preview proof), verification results, findings fixed, findings still open,
every criterion the reviewer answered `CANNOT VERIFY` with the check it says a human
must make, anything the builder noted as out of scope, and the notes the *Docs gate*
touched, and the `## Remembered` lines from `04-review.md` verbatim, so what the run
saved to memory and to global knowledge is visible without opening a file (deleting
or editing a line in `~/.kaizen/knowledge/` is the undo). Where the run used `runner: lite` and reviewed inline (`review.executor: inline`), say
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
intact, with `CANNOT VERIFY` criteria after them, and let the user name what to fix and
what to backlog — "fix 2, backlog 5". A number not named is not touched and not filed;
it stays in `04-review.md`. This is the
same granularity the fix loop already works at; the only change is that the user
picks the subset instead of accepting or declining the whole review.

Before setting `stage: "done"`, append the findings, criteria and work the user asked
to backlog at the final approval to `runs/<id>/06-backlog.md`, each as `open`, in the format given
in *Backlog* above. Check existing entries and do not append a duplicate. Builder
notes outside the approved scope are reported, but are not filed without an explicit
request.

Finish with `kaizen done <id>` once the user accepts (`--user-approved` for a yes given in chat); do not hand-write `stage: "done"`.

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
from the project folder: `kaizen card add "<short title>" --notes "<details>"`. The title
is what the card shows — a few words, like a commit subject; everything else (scope,
context, open questions, where it came from) goes in `--notes`, never in the title.
It links the card to
the run in flight (`--parent <run id>` names another), and the link follows the card into
the run it becomes. The board shows the parent's name on the child.

When a child run reaches `done`, the board appends `Child <child id> done: <title>` to
the parent's `notes.md` by itself. The parent documents it from there: if it is still in
flight its next stage reads `notes.md`; if it is already `done`, the entry is the record.
Never reopen a finished parent.

**A roadmap's increments are filed at its approval.** When the approved plan has a
`## Roadmap` (see *A whole application is a roadmap* in `spec-plan.md`), the same write
that records the approval files increments 2 to N, in order, from the project folder:
`kaizen card add "<title> (roadmap #N · after #a, #b)" --parent <run id>`, with
`any time` in place of `after …` where it has no prerequisite and its `blocked: <reason>`
kept in the text where it has one. Increment 1 is this run's own build. Nothing starts
by itself: the user starts an increment from its card when they choose, and the parent's
card lists its children with their status. An increment cut at the approval is not
filed; it goes to the backlog only when the user explicitly defers it.

## Discovery rounds

A roadmap plan's Discovery and any run's REA offer reach the user through the main
thread, under every runner: each round's questions are asked with the tool's structured
question mechanism (AskUserQuestion in Claude Code), all of a round's questions in one
call, each with the planner's recommended option first. Under `runner: full`, the
planner stops after writing a round; dispatch it again with the answers, recorded in
`02-approval.md` as that round's decisions, until it writes a plan with no round left
to ask, then present that plan at the plan approval as usual. Answers are not an
approval: the run stays at `stage: "plan"` with `awaiting: null` throughout, and
`awaiting: "approvals.plan"` is set only once `01-plan.md` has a `## Roadmap` — a round
written to that file is not a plan to approve, and a tool resuming the run re-asks its
questions. Where the user says yes to REA before the plan exists, run the study here,
write what it found to the run's `notes.md`, and dispatch the planner with it. Where
REA has to be installed first, the install in *Offer REA* (`spec-plan.md`) is the main
thread's too: doctor, the dry-run shown to the user, setup only on their approval,
then the restart, after which the run resumes at `stage: "plan"` from `state.json`.
