# Kaizen — implement stage

Read with [`spec.md`](spec.md) (core: track, intake, resume). This file is the
builder's contract. The planner and reviewer do not read it.

---
## Stage 2 — Implement

**Agent:** builder. **Input:** `01-plan.md`, `02-approval.md`, the track.
**Output:** the deliverable itself, plus `03-impl.md`.

The builder produces whatever the track's deliverable is — code, a chapter, the
campaign copy, the runbook — and nothing else.

This file is the contract whether the builder is a dispatched agent or the main
thread working inline (see `build.executor`). Working inline changes who is typing,
not what is owed: the plan is still the scope, a step that turns out wrong still
stops the stage instead of being improvised around, and `03-impl.md` is still written
before the reviewer is called. The temptation inline is to skip the file because the
work is already visible in the conversation — but the reviewer never sees that
conversation, and reads the file instead.

Rules:

- Work only within the plan's scope. Something out of scope that clearly needs doing
  is written to `03-impl.md` as a note, not produced.
- If a step turns out to be impossible or wrong, stop and report. Do not improvise a
  different approach — that silently discards the approval the plan received.
- Match what is already there: a codebase's conventions and idioms, a manuscript's
  voice and structure, a brand's tone. New work should be indistinguishable in style
  from the surrounding material.
- Carry out the plan's verification and record the real result, whatever the track's
  verification is.
- Every technique the plan's `reason`-tier gate covers — a new dependency, a new
  abstraction, a new file, a new section — is allowed, and costs one written line
  saying what it serves. The line is the price of the technique, not a request for
  permission. No line means the reviewer records a finding.
- The `git.*` settings apply only where the work sits in a git repository. In a plain
  folder there is no branch to make and no commit to skip, and that absence is not a
  finding.

**Keep `progress.md` while you work.** Before the first change, write
`runs/<id>/progress.md` with one line per bullet of the plan's Work list, in order:
`- todo: <bullet text>`. Change a line's prefix to `- doing:` when you start that item
and to `- done:` when it is finished, with exactly one `doing` at a time. Rewrite the
prefix only, never the text or the order. The board shows this file live on a building
run, so it is how a person sees where the build is. It is a progress report, not the
record — `03-impl.md` still is — and fix iterations do not touch it.

**Baseline first, in any track with an existing suite of checks.** Before changing
anything, run whatever already proves the existing material correct — the test suite,
the linter, the link checker, the fact-check pass — and record the result in
`03-impl.md`. Run it again after. Two results, before and after, are what turn "my
change works" into "nothing else broke". A check already failing before the change is
not this run's finding; a check that passed before and fails after is, and it stops
the stage.

**Keep the working transcript small.** Everything the builder reads stays in its
context and is re-read on every request that follows, so a full test-suite dump at the
start of the stage is paid for again at every step after it. Pipe long output through
a filter that keeps the decisive lines — the failure count, the failing test names, the
first error — and read the full output only when a check actually fails. The same holds
for reading material: open the manifest's paths at the ranges the plan names, not whole
files, and never re-read a file this stage already changed. `03-impl.md` records the
result, not the transcript.

**Read the plan's File manifest instead of searching.** The planner already located
every path this run touches. Search the material only for what the manifest does not
cover, and note in `03-impl.md` what was missing from it.

`03-impl.md` must list: what was produced or changed with a one-line reason each,
deviations from the plan and why, verification carried out with its actual result,
and anything deliberately left undone. Write each changed path in backticks, relative
to the repository, and no other path that way: the board commits a run by the changed
files its report names, so a changed path written any other way is left out of the
commit, and a backticked path the run did not change is taken into it. Report failures honestly; a false claim of
success poisons the review stage, which trusts this report.

**A `## Preview` section says how to see the result.** For an app or service: the
commands to start it locally and the URL to open, copied from the material's own README
where one exists. For anything else — a document, copy, a runbook, a memo — the path
to open, or the result itself when it fits in a screen. The board shows this section on
the run's card, so a person can try the work without reading the rest of the report.

It also says how to test the result, under a `### How to test` subhead: numbered steps a
person follows to check the run did what was asked, each an action and what they should
see — "open Settings → Board, clear the field: it shows `not set`". Derive the steps
from the plan's gate, covering what the request asked for rather than every internal
check. An automated check goes in too, as its command and the result it should give,
but never alone: a test command tells a person the code passes, not that the work does
what they wanted. Use `###` subheads inside the section, never `##`: the board ends the
section at the next `##`.

**A `## Commit` section is the commit message for the work**, where the work sits in a
git repository. The first line is a Conventional Commits subject,
`<type>(<scope>): <what changed>`, with the type one of `feat`, `fix`, `refactor`,
`perf`, `docs`, `test`, `build`, `ci`, `chore`, `style`, `revert`, the scope optional,
and at most 72 characters. It says what this run produced, not what was asked: the
request is often a symptom or a wish, and the log should read as what changed. A body
may follow after a blank line. The board offers this message at commit and push and
refuses one without a type. A fix iteration that changes what the work is rewrites it.

**The gate block closes the stage.** `03-impl.md` ends with one line per gate item
from the plan's Verification section:

```
G-01 PASS: ran `php artisan test --filter=Payroll` — 214 passed, 0 failed
G-02 PASS: cash→transfer switch exercised in the UI; bank rows validated, 422 gone
G-03 FAIL: payslip PDF still prints the old label
```

A `PASS` states what was actually done and what came back — the command and its
output, the page opened and what appeared, the person who read it and what they
understood. `PASS` on its own is not a result, and neither is a restatement of the
gate item; both are read as an admission the check did not happen.

**Work that was never executed cannot pass.** In any track where the deliverable can
be run, opened, or read by someone, doing so is part of building it: the suite run,
the page opened and clicked, the runbook walked start to finish, the copy read aloud.
A gate item whose evidence is an argument that the code should work is a `FAIL`.

The stage does not hand off with a `FAIL` standing. Fix it and re-run the gate, or —
if it cannot be fixed inside the plan's scope — stop and report, exactly as with an
impossible step. A `FAIL` carried into review wastes the reviewer's pass on something
already known to be broken.

## Stage 4 — Fix loop

Governed by `auto_fix`. See the skill's fix-loop section for the exact behavior.

Each iteration writes `05-iterations/NN-fix.md` (what the builder changed) and
`NN-recheck.md` (what the reviewer found afterward). The loop ends when the reviewer
reports nothing at or above the threshold, or `max_iterations` is reached.

A finding the loop could not close is escalated to the user with the reviewer's
description intact — never quietly downgraded to make the run look clean.

**An iteration reads the finding, the work, and the gate.** Not the plan. Fixing a
named defect needs the reviewer's line, the diff so far, and the gate the result must
still pass; it does not need the framing, the alternatives rejected, or the out-of-scope
list, all of which were settled before the finding existed. Read `01-plan.md` only when
a finding turns on what was approved — a scope question, or a fix that would take the
work outside it.

Fix what the finding names and stop. A second defect noticed while fixing the first is
a note in the iteration file, not a second fix: it has not been reviewed, and the
recheck is scoped to what the iteration claims to have changed.

