---
name: kaizen
description: >
  Staged workflow for any kind of work: plan, human approval, build, then independent
  review with a bounded fix loop. Not only for code — a run infers its own track (code,
  writing, communication, operations, research) and every stage reads "deliverable",
  "verification", and "finding" in that track's terms. Each stage runs as its own
  subagent with clean context, and all state lives in a portable `.kaizen/` directory so
  a run can be resumed later, by another session, or by another AI tool (Codex,
  Antigravity). Use when the user says "kaizen", "/kaizen", asks to plan-then-build-then-review
  something, wants approval steps before work begins, or wants to resume or check an
  existing kaizen run. Also use to install the workflow into a repository.
---

# Kaizen

A staged workflow for non-trivial development work:

```
request -> PLAN -> [approval] -> IMPLEMENT -> REVIEW -> [fix loop] -> [approval] -> done
```

Three separate subagents do the work. They never share a context window, which is
the point: a reviewer that watched the code being written will rationalize it, a
reviewer that sees only the diff and the plan will not.

The stage contract is split so no reader loads a stage it is not running:
[`spec.md`](spec.md) is the core (track, intake, resume) and every reader takes it,
plus exactly one of [`spec-plan.md`](spec-plan.md), [`spec-build.md`](spec-build.md),
[`spec-review.md`](spec-review.md), or [`spec-main.md`](spec-main.md) — the main
thread's own file. Read core plus your stage before running it; do not read the
others. Configuration defaults are in [`config.default.yml`](config.default.yml).
Porting the workflow to Codex or Antigravity is covered in [`adapters.md`](adapters.md).

## Commands

| Invocation | Action |
|---|---|
| `/kaizen <request>` | Start a new run in the configured mode (default: `approve`) |
| `/kaizen plan <request>` | Start a run and stop after the plan (`plan-only`) |
| `/kaizen auto <request>` | Start a run in `auto` mode: every stage back to back, no approval stops |
| `/kaizen run` | Resume the current run and execute the approved plan |
| `/kaizen review [target]` | Review-only: audit existing code, no plan, no implementation (`review-only`) |
| `/kaizen status` | List every run grouped waiting-on-you / in flight / done / abandoned, plus the open backlog count |
| `/kaizen backlog` | Print the open backlog items across all runs, grouped by source run, with rescued items last under `Orphaned` |
| `/kaizen approve` | Approve whatever the current run is waiting on |
| `/kaizen reject <reason>` | Reject it; the reason is fed back to the stage that produced it |
| `/kaizen abort` | Mark the current run abandoned |
| `/kaizen config` | Show this project's settings and change them, one picker per setting |
| `/kaizen init` | Install `.kaizen/` with the `spec*.md` files, config, and the gitignore entry into the current repository |
| `/kaizen install` | Install the workflow itself globally or per-project (see below) |

If the user typed `/kaizen` with no argument and a run is in progress, treat it as
`/kaizen status`. If no run is in progress, ask what they want to build.

## Before doing anything

1. Locate the state directory: `.kaizen/` in the repository root, else `~/.kaizen/`
   keyed by working directory. If neither exists and the user is starting work, run
   `/kaizen init` first: it creates `.kaizen/` with a copy of the `spec*.md` files, a config, and
   the gitignore entry (see [`adapters.md`](adapters.md)).
2. Read `.kaizen/config.yml`, falling back to `config.default.yml` in this skill for
   any key it does not set.
3. Read `.kaizen/runs/<current>/state.json` if a run is active. Never assume the
   stage from conversation memory — the run may have been advanced by another tool
   or another session.
4. Read `.kaizen/memory.md` if present. It holds cross-run lessons and carries real
   weight: it is what previous reviewers learned about this codebase.

## Settings

`/kaizen config` reads `.kaizen/config.yml`, falling back to `config.default.yml` for
anything it does not set, and prints the current value of each setting below with a
one-line meaning. Then it offers the settings as choices — the tool's structured
question mechanism, one option per legal value, never free text — and writes back
whichever the user picks.

| Setting | Values | What it decides |
|---|---|---|
| `mode` | `approve`, `auto`, `plan-only`, `review-only` | Where a run stops |
| `build.executor` | `subagent`, `inline`, `ask` | Who carries out the approved plan |
| `approvals.plan` | `true`, `false` | Stop and show the plan before anything is built |
| `approvals.review` | `true`, `false` | Stop after the review, before the run is called done |
| `approvals.each_file` | `true`, `false` | Confirm every individual edit |
| `auto_fix.enabled` | `true`, `false` | Fix findings without asking, or hand every one over |
| `auto_fix.min_severity` | `critical`, `high`, `medium`, `low` | How bad a finding must be to be fixed automatically |
| `auto_fix.max_iterations` | `1`–`5` | Fix and recheck rounds before what is left is escalated |
| `review.write_memory` | `true`, `false` | Let the reviewer append lessons to `memory.md` |
| `git.auto_commit` | `true`, `false` | Commit the work when a run finishes |
| `git.branch_before_implement` | `true`, `false` | Branch before building when on the default branch |

Rules for writing the file:

- **Change the value in place.** `config.yml` ships with a comment above every key
  explaining it; rewriting the file from a parsed object throws all of them away.
  Edit the one line.
- **Only what the user picked.** A key the user did not touch stays absent if it was
  absent — an absent key inherits the default, and writing every key out freezes
  today's defaults into the project forever.
- If `.kaizen/` does not exist yet, run `init` first, then continue.
- After writing, print the setting and its new value, and nothing else. No summary of
  the whole file.

Settings not in the table — the review checks, backlog and state paths, the track
default — are edited by hand in `config.yml`, which is commented throughout. Say so
rather than offering a picker with thirty options.

## Modes

Set by `mode` in config, overridable per invocation.

- **`plan-only`** — produce the plan, write it, stop. No code is touched.
- **`approve`** (default) — stop at every approval enabled in config and wait for an
  explicit human decision.
- **`auto`** — run every stage back to back with no approval, report at the end. The fix
  loop still respects `max_iterations`.
- **`review-only`** — skip plan and implementation, run the reviewer against existing
  code or a diff.

Mode never overrides a refusal: destructive or irreversible actions still get
confirmed even in `auto`.

## Approvals

Approvals are configured, not hardcoded. Each enabled approval halts the run, writes what it
is waiting for into `state.json`, and reports to the user. The run only advances on
an explicit `/kaizen approve` or a clear approval in conversation.

- `approvals.plan` — after the plan, before any code is written. On by default.
- `approvals.review` — after the review passes, before the work is called done. Off by
  default: with `auto_fix` on, it mostly asks for approval of a report being read anyway.
- `approvals.each_file` — confirm each file edit individually. Off by default; slow.

A rejected approval is not a failure, and it is not always the same action. Two shapes:
**revise** ("do it differently") sends the plan back to the planner, which produces a
new version and returns to this same approval. **Kill** ("not doing this") means the
request itself was wrong, not the approach — set `stage: "abandoned"` and stop, no
revision to make. The reason says which; state the reading taken in `02-approval.md`
when it is not obvious. See *Plan approval* in [`spec-plan.md`](spec-plan.md) for the full rule.

**Asking the user anything:** use AskUserQuestion with 2–4 concrete options, taken
from the options the planner wrote into the plan. Subagents cannot prompt the user,
so every question reaches them through you. Do not add an "other" option — free text
is always available. Reserve plain prose questions for things that genuinely have no
discrete answers.

**Before the builder runs:** show the plan's **Work list** — plain bullets of what
will actually be done. It is the last thing the user sees before anything is
produced, so show it even when they have already approved the plan in conversation.

## The fix loop

When the reviewer reports findings, behavior depends on config:

- `auto_fix.enabled: false` — always stop and hand every finding to the user as a
  decision, listed by the reviewer's number so the user can name a subset. Nothing is
  fixed automatically.
- `auto_fix.enabled: true` — the builder fixes findings at or above
  `auto_fix.min_severity` (default `high`), the reviewer re-checks, repeating up to
  `auto_fix.max_iterations` (default 2). Findings below the threshold, and anything
  still open when iterations run out, are reported to the user rather than silently
  dropped.

Every iteration is written to `runs/<id>/05-iterations/` so the loop is auditable.

## Backlog and status

Each run keeps its own backlog at `runs/<id>/06-backlog.md`. You write it, in the main
thread, at two writes that already happen: `02-approval.md` at the plan approval
(out-of-scope suggestions not folded into the approved scope, and anything cut at the
approval) and `stage: "done"` at the final approval (findings still open, findings
below the fix threshold, and the builder's out-of-scope notes). No subagent writes it.
The full rules are in [`spec-main.md`](spec-main.md).

Items are one line each, `- <status>: <item text>`, with `<status>` one of `open`,
`done`, or `rejected`. Findings keep the reviewer's line verbatim. `rejected` always
carries a reason after a `|`. Closing an item edits its status in place; the line
stays in the run's file as record.

`/kaizen backlog` reads every `runs/*/06-backlog.md` at read time and prints the `open`
items only, grouped by source run, newest run first. There is no central backlog file
to keep in sync. `<state.dir>/backlog.md` is an orphanage and nothing more: before
`state.keep_runs` prunes a run, move that run's still-open items into it. `/kaizen
backlog` reads that file too and prints its open items last, under an **Orphaned**
group, so a rescued item stays visible after its run is gone.

**`/kaizen backlog` and `/kaizen status` are read-only.** They print; they never edit
a `06-backlog.md` or `state.json`, even when reading one turns up an inconsistency
(a stale `open` item already closed elsewhere, a duplicate, a bad reference). Report
what looks wrong as part of the output and ask before touching anything — fixing it
unasked is exactly the scope creep the rest of this spec exists to prevent, applied to
kaizen's own bookkeeping instead of a user's code.

`/kaizen status` reads each `runs/*/state.json` live and prints every run in four
groups:

```
Waiting on you   — awaiting is non-null and stage is not "abandoned"
In flight        — awaiting is null and stage is neither "done" nor "abandoned"
Done             — stage is "done"
Abandoned        — stage is "abandoned" (set by /kaizen abort)

Backlog: <n> open
```

The count is every open item across all runs plus the orphanage. An abandoned run's
backlog items are not open work: leave them in place, and do not print or count them.

Each line is the run id, its stage, and what it is awaiting. Grouping is derived from
`state.json` at read time, never from the directory name — run directories are flat and
are never renamed or moved, so a path written into another file cannot break.

## Running a stage

Each stage runs as a subagent via the Agent tool, with the agent type named below.
Pass it the run directory path and let it read its own inputs from there — do not
paste plans or diffs into the prompt, since the file is the shared source of truth
across tools. Name its spec files in the prompt: core `spec.md` plus its own stage
file, never the whole set.

| Stage | Agent type | Writes |
|---|---|---|
| Plan | `kaizen-planner` | `01-plan.md` |
| Implement | `kaizen-builder`, or the main thread when `build.executor` is `inline` | `03-impl.md` + the actual changes |
| Review | `kaizen-reviewer` | `04-review.md` |

`build.executor` decides who implements: `subagent` (default), `inline` — the main
thread does it against the same contract in `spec-build.md` — or `ask`, which puts
the choice at the plan approval. Building inline does not make the review less
independent: the reviewer is a separate agent in every case, and never sees the
conversation the work happened in.

After a subagent returns, update `state.json` yourself in the main thread. Subagents
report; the main thread owns the state machine.

**Scope precisely, don't scope narrow.** Each subagent starts cold — no context from
you carries over except what the prompt names. List exactly the files this stage's
task actually touches; don't default to "read everything" for safety. But cutting a
file the task genuinely needs is worse than the tokens it would have cost: a
under-scoped subagent produces a wrong plan or misses a real defect, which costs a fix
iteration — more tokens than the read would have. Precise beats narrow.

Relay what matters from each subagent's report to the user — their output is not
shown automatically.

## State layout

```
.kaizen/
  spec.md                       # core contract, copied in by init
  spec-plan.md                  # per-stage contracts; each reader takes core + one
  spec-build.md
  spec-review.md
  spec-main.md
  config.yml
  memory.md                     # cross-run lessons, appended by the reviewer
  backlog.md                    # orphanage only: open items rescued before pruning
  runs/
    2026-09-02-add-oauth/
      00-request.md             # the original request, verbatim
      01-plan.md
      02-approval.md            # decisions, with reasons and timestamps
      03-impl.md                # what changed, which files, what was skipped
      04-review.md              # findings, numbered and severity-tagged
      05-iterations/
        01-fix.md
        01-recheck.md
      06-backlog.md             # what this run deliberately did not do
      state.json
```

`state.json` is the resume point:

```json
{
  "id": "2026-09-02-add-oauth",
  "mode": "approve",
  "stage": "review",
  "awaiting": "approvals.review",
  "iteration": 1,
  "updated": "2026-09-02T14:31:00+07:00"
}
```

`init` adds a gitignore entry that ignores run state but keeps the workflow: it
ignores `.kaizen/*` and un-ignores `.kaizen/spec*.md` and `.kaizen/config.yml`, which
are meant to be committed (see [`adapters.md`](adapters.md)).

## Install

`/kaizen install` asks where the workflow should live: **global** (this machine, every
project) or **per-project** (this repo, committed, shared with the team). Both can
coexist; the project copy wins when present.

**Global.** Kaizen's source of truth is the repo at `~/kaizen` (symlinked in on this
machine). Installing or updating global kaizen means that repo is current and linked:

```bash
[ -d ~/kaizen ] && (cd ~/kaizen && git pull) || git clone <kaizen repo url> ~/kaizen
mkdir -p ~/.claude/skills ~/.claude/agents
ln -sfn ~/kaizen/skills/kaizen ~/.claude/skills/kaizen
for f in kaizen-planner kaizen-builder kaizen-reviewer; do
  ln -sfn ~/kaizen/agents/$f.md ~/.claude/agents/$f.md
done
```

Symlinks, not copies — future `git pull` in `~/kaizen` updates every project on this
machine at once. This only works because `~/kaizen` is a repo the installing user
controls; it is not something to hand a teammate.

**Per-project.** A teammate cloning this repo does not have access to `~/kaizen` (it
can be private, or simply not theirs), so the project copy must be self-contained —
real files, not symlinks, committed into the project:

```bash
mkdir -p .claude/skills/kaizen .claude/agents
cp ~/kaizen/skills/kaizen/*.md ~/kaizen/skills/kaizen/*.yml .claude/skills/kaizen/
cp ~/kaizen/agents/kaizen-*.md .claude/agents/
git add .claude/skills/kaizen .claude/agents/kaizen-*.md
```

Then commit. Updating a per-project copy later means re-running the `cp` lines against
a current `~/kaizen` and committing the diff — there is no live link to keep it in
sync automatically, by design.

`install` also offers to write the adapter files from [`adapters.md`](adapters.md) so
Codex and Antigravity follow the same spec, per-project only (a global adapter file has
nowhere sensible to live).
