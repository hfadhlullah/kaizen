# Kaizen

Kaizen is a staged workflow for work that is too big to hand an AI in one go. Instead
of one agent that plans, writes, and then congratulates itself, the work is split into
three agents that never share a context window, with human approval stops in between.
You approve a plan before anything is produced, and an independent reviewer that never
saw the work being made checks it afterwards.

```
request -> PLAN -> [approval] -> IMPLEMENT -> REVIEW -> [fix loop] -> [approval] -> done
```

Everything a run knows lives in plain files under `.kaizen/`, so a run can be paused,
resumed tomorrow, resumed by a different session, or picked up by a different tool.

## Why the reviewer runs in a separate context

This is the one design decision worth understanding before you use it. An agent that
watched itself write the code will rationalize it — it remembers why every line seemed
reasonable, and that memory is exactly what stops it from finding the bug. The kaizen
reviewer starts fresh. It sees the plan, the diff, and the implementation notes, and
nothing else. It has no reason to defend anything.

The same split is why the planner does not implement: a plan written by the agent that
is about to do the work bends toward what is easy to write.

## Install

First get the skill onto your machine: copy or clone this directory somewhere Claude
can read it. Then ask Claude to install kaizen from there, and it will ask where the
workflow should live:

- **Global** — `~/.claude/skills/kaizen/` and `~/.claude/agents/kaizen-*.md`.
  Available in every project, not shared with your team.
- **Per-project** — `.claude/skills/kaizen/` and `.claude/agents/kaizen-*.md`,
  committed so the team gets the same workflow.

Both can coexist; the project copy wins. Install also offers to write the adapter
files from [`adapters.md`](adapters.md) so Codex and Antigravity follow the same spec.

The workflow is `SKILL.md`, the split spec (`spec.md` core plus `spec-plan.md`,
`spec-build.md`, `spec-review.md`, `spec-main.md` — each reader takes core plus one),
`config.default.yml`,
`adapters.md`, and this README, plus the three agent definitions `kaizen-planner.md`,
`kaizen-builder.md`, and `kaizen-reviewer.md`.

To set a repository up for runs, ask for `kaizen init`. That creates `.kaizen/` with a
copy of the `spec*.md` files, a config, and the gitignore entry.

## Your first run

Say what you want, and say the word kaizen:

> kaizen: add rate limiting to the public API

That is the whole invocation. The skill triggers on the word, so a plain sentence is
enough — no special syntax, no flags. `SKILL.md` also documents slash forms like
`/kaizen plan <request>`, `/kaizen status`, and `/kaizen approve`; those are shorthand
for the same requests, and they only work as literal slash commands if you have
installed a command file at `~/.claude/commands/kaizen.md`. Nothing here requires one.
Saying "kaizen status" or "approve the plan" works either way.

Then the run stops twice, and both stops want something specific from you.

**Stop one — the plan.** You get a written plan: what is wrong today, what would be
true instead, the approach chosen, what was rejected and why, and a plain-bullet
**Work list** of what will actually be done. If the request had genuine ambiguity, the
plan ends with open questions, and they reach you as a pick list of two to four
concrete options rather than an open prompt. You can always type something else.

Three things newcomers do not expect:

- **"Yes, but change X" is a normal answer.** You are not limited to approve or
  reject. Approving with a modification — a different value, a dropped step — is
  recorded in the approval file and binds the builder.
- **Rejecting is not a failure.** The reason is written down and handed back to the
  stage that produced the artifact, which revises and re-presents.
- **The planner also lists out-of-scope suggestions** — things it noticed but did not
  fold into the plan. Each is a separate yes or no. Saying nothing means no.

Nothing is produced until you clear this stop.

**Stop two — the review.** After the work is done, the reviewer reports findings with
severities, and the run stops before calling the work done. If a finding is below the
auto-fix threshold, or still open when the fix rounds run out, it is reported to you
rather than quietly patched.

## What a run decided not to do

Both stops throw things away. The planner's out-of-scope suggestions you did not take,
the low findings nobody fixed, the "later" you said at an approval — all real work, all
previously surviving only in the conversation.

Kaizen writes them down instead, into `06-backlog.md` inside the run that produced
them, so an item sits next to the plan and the review that explain it. You do not
maintain this file; it is written at the two moments the run already writes to disk —
recording the plan approval, and marking the run done — so there is nothing to
remember.

Every item is `open`, `done`, or `rejected`. **Rejected is a real answer**: most
suggestions are not worth doing, and without a way to decline one it stays on the list
forever. Rejecting takes a reason, which is what stops the same idea coming back three
runs later. Closed items stay in their run's file as record and are never printed
again.

Two commands read across all of it:

- **`kaizen backlog`** — every open item, grouped by the run it came from, newest
  first, with items rescued from pruned runs last under *Orphaned*. Nothing done,
  nothing rejected.
- **`kaizen status`** — every run you have, in four groups: waiting on you, in flight,
  done, and abandoned, with the open backlog count at the bottom.

A run you abort is abandoned, not outstanding: it sits in its own group and its backlog
items stop being printed and stop being counted.

Status is read live from each run's `state.json`, so nothing gets renamed or moved when
a run finishes and no path you have written down elsewhere ever breaks.

One thing to know about pruning: `state.keep_runs` eventually deletes old run
directories. Before a run goes, its still-open items are moved into
`.kaizen/backlog.md` — that file exists only as an orphanage. `kaizen backlog` reads it
too and prints those items last, under *Orphaned*, so nothing outstanding disappears
just because its run did. Items already done or rejected are deleted with their run,
which is the point.

## A real run, start to finish

This one actually happened. The whole request was one line, said in passing:

> for this dropdown omarchy terminal can we make it much more to the bottom?

**Intake** wrote that down verbatim in `00-request.md`, along with what it could
establish on its own: the script is `~/.local/bin/omarchy-dropdown`, bound to
`SUPER + grave`, and its height comes from `OMARCHY_DROPDOWN_HEIGHT`, default `0.55`.

**The plan** noticed the request had two readings — the panel *extending* further down
versus the whole panel *sitting* lower — and, rather than asking which, argued for the
first and said so plainly:

> Reading (2) already has a knob — `GAP` (`omarchy-dropdown:13`) — and it does not do
> what the phrase wants. [...] Setting `GAP=200` moves the top down to y=230 but shrinks the height to 555,
> putting the bottom edge at 785 — *higher* than today.

It proposed `HEIGHT_FRACTION` `0.55 → 0.80`, and listed fixing the `GAP` asymmetry as
an out-of-scope suggestion rather than doing it.

**The approval** is the interesting part, because it was neither yes nor no:

> **Value changed: 0.80 → 0.70.** The user chose a smaller increase than proposed
> [...] Wherever the plan specifies `HEIGHT_FRACTION=0.80`, use **`0.70`** instead.
> Nothing else changes: same file, same three steps, same verification.

The out-of-scope `GAP` fix was explicitly not approved, which made it off-limits for
the rest of the run.

**The implementation** changed one token, verified the geometry arithmetic instead of
toggling the live window, and reported the thing it did not do:

> Live steps 3-6 of the plan's verification [...] were not run: this run was
> explicitly instructed not to toggle the live dropdown.

**The review** re-derived the numbers independently, confirmed the file said `0.70` and
not `0.80`, confirmed the `GAP` code was untouched — and found one thing nobody had
considered: a second monitor configured as portrait might report an untransformed
height, in which case the larger fraction could overflow where the old one did not.

> `FINDINGS: 0 critical, 0 high, 0 medium, 1 low`

Low is below the default fix threshold, so it was not auto-fixed. It was reported, with
the exact command to settle it when that monitor is next plugged in. The reviewer also
left a line in `memory.md`, which every later run in this directory reads:

> `GAP` cannot — `geometry()` subtracts `gap * 2` from the height but adds `gap` only
> once to `y`, so raising GAP moves the bottom edge *up*. Unfixed as of 2026-09-02.

One-line request, six files, one real finding, one lesson that outlives the run.

## Kaizen is not only for code

Every stage adapts to the **track** — the kind of work a run is doing, which is what
decides what *deliverable*, *verification*, and *finding* mean. A chapter, a landing
page, a migration runbook, and a research memo each get a reviewer that checks the
right things; a reviewer hunting race conditions in a manuscript is worse than none.

The track is inferred from your request and stated back to you in the plan, so you
correct a reading instead of categorizing your own work. You are never asked "is this
software or writing?"

## Configuration

Defaults live in [`config.default.yml`](config.default.yml). Copy it to
`.kaizen/config.yml` in a repository and override only the keys you care about;
anything absent falls back to the defaults.

| Key | Default | Change it when |
|---|---|---|
| `mode` | `approve` | You want `plan-only` to think without building, `auto` to run unattended, or `review-only` to audit existing work |
| `approvals.plan` | `true` | Rarely. This is the stop that makes the workflow worth running |
| `approvals.review` | `false` | Set `true` to add a second human stop after the review; with `auto_fix` on it mostly re-approves a report you are already reading |
| `approvals.each_file` | `false` | You want to confirm every single file edit. Maximum control, slowest |
| `auto_fix.enabled` | `true` | Set `false` and every finding becomes your decision instead |
| `auto_fix.min_severity` | `high` | Lower to `medium` or `low` to have more auto-fixed; raise findings you see instead of auto-fixing |
| `auto_fix.max_iterations` | `2` | Fix/recheck rounds before whatever is left is escalated to you |
| `review.memory_max_lines` | `100` | The cap on `memory.md`, which every stage of every run reads. Raise only if the lessons are genuinely all load-bearing |
| `git.auto_commit` | `false` | Leave it. Kaizen does not commit or push unless you ask |
| `track.default` | `""` (inferred) | A repo that is always one kind of work, e.g. a docs repo |
| `backlog.enabled` | `true` | Set `false` to skip both backlog capture points; the run still executes, just without a `06-backlog.md` |
| `backlog.file` | `06-backlog.md` | The per-run file name. Rarely. |
| `backlog.statuses` | `[open, done, rejected]` | Rarely. Only `open` items are printed |
| `backlog.orphan_file` | `backlog.md` | Where open items go when their run is pruned |
| `state.keep_runs` | `20` | You want a longer or shorter run history |

Mode never overrides a refusal: destructive or irreversible actions still get confirmed
even in `auto`.

## Where your files live

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
      04-review.md              # findings, severity-tagged
      05-iterations/
        01-fix.md
        01-recheck.md
      06-backlog.md             # what this run deliberately did not do
      state.json
```

`state.json` is the resume point — stage, mode, and what the run is waiting on:

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

If a repository has no `.kaizen/`, state goes to `~/.kaizen/` keyed by working
directory instead.

Run state is per-person and not worth committing; the workflow itself is. `init` writes
this gitignore stanza:

```gitignore
.kaizen/*
!.kaizen/spec*.md
!.kaizen/config.yml
```

## Where to go next

- [`spec.md`](spec.md) + [`spec-plan.md`](spec-plan.md), [`spec-build.md`](spec-build.md),
  [`spec-review.md`](spec-review.md), [`spec-main.md`](spec-main.md) — the tool-neutral
  stage contract, split so each reader loads only core plus its own stage: exactly what
  that stage reads, writes, and must not do. If anything here and the spec disagree, the spec
  wins.
- [`config.default.yml`](config.default.yml) — every key with its default and a comment.
- [`adapters.md`](adapters.md) — running kaizen from Codex or Antigravity, and handing a
  half-finished run between tools.
- [`SKILL.md`](SKILL.md) — the instructions the agent itself follows. Read it if you want
  to know what Claude is doing between your two approval stops.
