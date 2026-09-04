# Kaizen — review stage

Read with [`spec.md`](spec.md) (core: track, intake, resume). This file is the
reviewer's contract. The planner and builder do not read it.

---
## Stage 3 — Review

**Agent:** reviewer, with a context that has never seen the builder's reasoning.
**Input:** `01-plan.md` (its File manifest names what to read), `03-impl.md`, the
track, and the work produced.
**Output:** `04-review.md`.

The track's third answer — *what would make it wrong* — is the reviewer's primary
brief. It reads that first and hunts for it specifically.

Four checks are universal, in every track:

1. **Correctness** — is it true, and does it hold up? For code: logic errors,
   unhandled cases, broken error paths, races, leaks. For a document: false claims,
   internal contradictions, unsupported conclusions. For communication: overclaims,
   and meaning the audience will not take as intended.
2. **Plan conformance** — did the work do what was approved, no more and no less?
   Scope creep is a finding. So is a step quietly skipped.
3. **Blast radius** — what else touches what changed. A diff shows the lines that
   moved; it does not show who depended on them. For every changed function, export,
   schema field, config key, endpoint, or shared string, find its other callers and
   readers and check each one still holds. This is the check a diff cannot contain,
   and skipping it is how a run that passes its own verification breaks a feature
   nobody looked at. In a non-code track the same question is "what else quoted,
   linked to, or depended on the part that changed".
4. **Regression** — the builder's before-and-after results from `03-impl.md`, verified
   rather than trusted: re-run the checks. A check that passed at baseline and fails
   now is a `high` finding at minimum, whatever else the work achieved. If the builder
   recorded no baseline, that absence is itself the finding.

Then the track's own checks. For software work: security, reuse and simplification,
test coverage. For a document: completeness against its own structure, accuracy of
every checkable claim, whether its intended reader can actually use it. For
operational work: missing prerequisites, absent rollback, steps that cannot be
executed as written. The plan's Verification section says what was promised; the
reviewer checks that promise was kept.

Each finding is one line: `<where>: <severity>: <problem>. <fix>.` Where is a
`path:line` for code, and a section, page, or step reference otherwise.
Severity is one of `critical`, `high`, `medium`, `low`.

The reviewer verifies before reporting: a finding it cannot construct a concrete
failing input or scenario for is dropped, not softened into a maybe. No praise, no
summary of what the code does, no style nits that do not change meaning.

The reviewer also appends any durable lesson about this codebase to `memory.md` —
a recurring bug pattern, a non-obvious constraint, a convention worth keeping. Not
run-specific detail; only what the next run would want to know.

`memory.md` is read by every stage of every future run, so its size is a tax on all of
them. Keep it under `review.memory_max_lines` (default 100): before appending, drop
any lesson that is now wrong, already enforced by a test or a lint rule, or restated
by a newer entry. A memory file that only grows stops being read carefully.

---

## Stage 4 — Fix loop

Governed by `auto_fix`. See the skill's fix-loop section for the exact behavior.

Each iteration writes `05-iterations/NN-fix.md` (what the builder changed) and
`NN-recheck.md` (what the reviewer found afterward). The loop ends when the reviewer
reports nothing at or above the threshold, or `max_iterations` is reached.

A finding the loop could not close is escalated to the user with the reviewer's
description intact — never quietly downgraded to make the run look clean.

