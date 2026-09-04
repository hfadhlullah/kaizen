# Kaizen — implement stage

Read with [`spec.md`](spec.md) (core: track, intake, resume). This file is the
builder's contract. The planner and reviewer do not read it.

---
## Stage 2 — Implement

**Agent:** builder. **Input:** `01-plan.md`, `02-approval.md`, the track.
**Output:** the deliverable itself, plus `03-impl.md`.

The builder produces whatever the track's deliverable is — code, a chapter, the
campaign copy, the runbook — and nothing else. Rules:

- Work only within the plan's scope. Something out of scope that clearly needs doing
  is written to `03-impl.md` as a note, not produced.
- If a step turns out to be impossible or wrong, stop and report. Do not improvise a
  different approach — that silently discards the approval the plan received.
- Match what is already there: a codebase's conventions and idioms, a manuscript's
  voice and structure, a brand's tone. New work should be indistinguishable in style
  from the surrounding material.
- Carry out the plan's verification and record the real result, whatever the track's
  verification is.

**Baseline first, in any track with an existing suite of checks.** Before changing
anything, run whatever already proves the existing material correct — the test suite,
the linter, the link checker, the fact-check pass — and record the result in
`03-impl.md`. Run it again after. Two results, before and after, are what turn "my
change works" into "nothing else broke". A check already failing before the change is
not this run's finding; a check that passed before and fails after is, and it stops
the stage.

**Read the plan's File manifest instead of searching.** The planner already located
every path this run touches. Search the material only for what the manifest does not
cover, and note in `03-impl.md` what was missing from it.

`03-impl.md` must list: what was produced or changed with a one-line reason each,
deviations from the plan and why, verification carried out with its actual result,
and anything deliberately left undone. Report failures honestly; a false claim of
success poisons the review stage, which trusts this report.

## Stage 4 — Fix loop

Governed by `auto_fix`. See the skill's fix-loop section for the exact behavior.

Each iteration writes `05-iterations/NN-fix.md` (what the builder changed) and
`NN-recheck.md` (what the reviewer found afterward). The loop ends when the reviewer
reports nothing at or above the threshold, or `max_iterations` is reached.

A finding the loop could not close is escalated to the user with the reviewer's
description intact — never quietly downgraded to make the run look clean.

