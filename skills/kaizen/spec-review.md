# Kaizen — review stage

Read with [`spec.md`](spec.md) (core: track, intake, resume). This file is the
reviewer's contract. The planner and builder do not read it.

---
## Stage 3 — Review

**Agent:** reviewer, with a context that has never seen the builder's reasoning.
**Input:** `00-request.md` first, then `01-plan.md` (its File manifest names what to
read), `03-impl.md`, and the work produced.
**Output:** `04-review.md`.

The track's third answer — *what would make it wrong* — is the reviewer's primary
brief. It reads that first and hunts for it specifically.

**Acceptance criteria come from the request, not the plan.** Before opening the plan,
the reviewer writes down what the verbatim request and its *done* and *wrong* lines
require, one checkable criterion each. Then it maps them onto the plan's gate: a
criterion a `G-nn` item already covers takes that id, and one the gate missed becomes
`R-01`, `R-02`, … A reviewer that takes its criteria from the plan checks the plan's
reading of the request, and inherits whatever the planner misread; an `R-nn` item is
where that misreading shows up. Plan conformance (check 2) still compares the work to
the plan; this compares it to what was asked.

Five checks are universal, in every track:

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

5. **Acceptance** — every criterion, `G-nn` and `R-nn`, answered against the work
   rather than against `03-impl.md`, by trying to falsify it: name the concrete check
   that would fail if the criterion did not hold — an input, a command, a sentence to
   compare, a step to walk — and run it. `PASS` means that attempt came back clean, not
   that the builder's evidence reads well. A `reason`-tier item fails when the
   technique is present and the written reason is not. An `R-nn` item that fails takes
   its severity on its own merits, like any finding outside the gate.

Then the track's own checks. For software work: security, reuse and simplification,
test coverage. For a document: completeness against its own structure, accuracy of
every checkable claim, whether its intended reader can actually use it. For
operational work: missing prerequisites, absent rollback, steps that cannot be
executed as written. The plan's Verification section says what was promised; the
reviewer checks that promise was kept.

**Keep the working transcript small.** Everything the reviewer reads stays in its
context and is re-read on every request that follows, so the re-run suite dumped in
full at check 4 is paid for again at every check after it. Pipe long output through a
filter that keeps the decisive lines — the failure count, the failing test names, the
first error — and read the full output only where a check actually fails, which is the
only place the detail becomes a finding. The same holds for the work under review: open
the manifest's paths at the ranges the plan names, and read the diff rather than the
whole file wherever the finding would cite a changed line. `04-review.md` records the
findings, not the transcript.

This does not apply to check 3. Blast radius is the check whose whole point is what
the diff does not contain, so it reads as widely as it needs to — every caller, every
reader, whole files where that is what it takes. A cheaper blast-radius pass is not a
cheaper review, it is the check not happening.

Each finding is one line, numbered from 1 within the review:
`<n>. <where>: <severity>: <problem>. <fix>. [G-nn]` Where is a `path:line` for code,
and a section, page, or step reference otherwise. Severity is one of `critical`,
`high`, `medium`, `low`. The number is what the user approves fixes by, and what the
fix loop and the backlog refer to afterward, so it never changes once written.

**A finding against a gate item cites it, and takes its severity from that item's
tier** — `block` is `critical` or `high`, `reason` is `medium`, `lock` is `low`. This
is what keeps the same class of problem from being graded differently run to run, and
it is not a judgment the reviewer re-litigates: the tier was set at the plan, which
the user approved. A finding outside the gate carries no id and is graded on its own
merits.

**Each criterion gets one of three answers**, in an `## Acceptance` section of its
own, after the findings — one unnumbered line per criterion, so nothing reads it as a
finding to fix:

```
G-01 PASS: ran `bun test` with the cache dir unwritable — 0 failed, error shown
G-02 FAIL: see finding 3
R-01 CANNOT VERIFY: needs a live Stripe account; the test-mode fixture skips webhooks. Human: refund one real charge and confirm the ledger row.
```

`CANNOT VERIFY` is for a check that needs something the reviewer does not have —
taste, a live account or device, a real reader, production data, a person's decision.
It states what was tried, why that does not settle it, and exactly what a human must
check. A check that is only slow or tedious is not unverifiable: run it. A `block`-tier
item left `CANNOT VERIFY` means the run is not clean, whatever the findings say.

The reviewer verifies before reporting: a finding it cannot construct a concrete
failing input or scenario for is dropped, not softened into a maybe. That drops
suspicions, never criteria: a criterion that cannot be settled is `CANNOT VERIFY`,
not silence. No praise, no summary of what the code does, no style nits that do not
change meaning.

The file ends with one verdict line: `PASS` when no finding is at or above medium
and no criterion is `CANNOT VERIFY`; otherwise
`FINDINGS: <n> critical, <n> high, <n> medium, <n> low`, followed by
`; <n> cannot verify` when any criterion was — even when every count is 0, so an open
human check never reads as a clean pass.

The reviewer also appends any durable lesson about this material to `memory.md` —
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

**A recheck is not a second review.** Re-answer the findings it was meant to close,
the criteria (`G-nn` and `R-nn`) the change could plausibly touch, and the regression check. Nothing
else. State which items were skipped and why, in one line, so the reader can disagree
with the judgement — a skipped item is a claim that the change could not have reached
it, and that claim is checkable.

Answering all of them again is not thoroughness, it is the same evidence gathered
twice. A fix that touched one line of a message string cannot have broken an item
about which directories the installer writes to, and re-running that item's live
setup to prove it costs more than the fix did. Where a change genuinely could have
reached everything — a rename across the run's files, a shared helper — say so and
re-answer everything.

The exception is the regression check, which runs every iteration whatever the fix
touched. It is cheap, and it is the one that catches a fix breaking something nobody
thought to connect it to.

