# Kaizen workflow specification

This file is the tool-neutral contract. Claude Code, Codex, and Antigravity all
follow this document; only the way stages are dispatched differs per tool. If an
adapter and this file disagree, this file wins.

A stage may only start when the previous stage's artifact exists on disk and the approval
between them, if enabled, has been resolved.

---

## The track

Kaizen is not a software workflow. The stage structure — frame, approve, produce,
review independently, fix under a bound — holds for a book, a marketing campaign, a
migration runbook, or a research memo just as well as for code. What changes per kind
of work is what the words *deliverable*, *verification*, and *finding* mean.

That meaning is fixed once, at intake, and recorded as the run's **track**. Every
later stage reads it and adapts. A reviewer hunting race conditions in a book
manuscript is worse than no reviewer at all, and a track is what prevents it.

**The track is inferred, never asked.** Reading a request and recognizing what kind
of work it is — an app, a chapter, a campaign, a runbook — is the workflow's job, not
the user's. Asking "is this software or writing?" hands back the analysis they came
here to have done, and a request almost always says which it is: what it names, the
verbs it uses, where the material lives, what the person is evidently trying to
produce. Read it and decide.

Do not classify against a fixed taxonomy of work types; the sixth kind of work will
not be on the list. Establish the track by answering three questions from the request
itself, and only then ask about what genuinely cannot be read from it:

1. **What is the deliverable?** A merged code change, a chapter, a landing page, a
   decision memo, a set of ad variants, a runbook someone else will execute.
2. **What counts as done?** The concrete, checkable condition. Tests pass. The
   chapter reads end to end without contradicting chapter two. A colleague can follow
   the runbook without asking a question. Someone in the audience understands the
   offer in one read.
3. **What would make it wrong?** The failure this work must not have. A security
   hole. A claim that is not true. A tone that alienates the reader. A step that
   silently loses data.

Answer three is what the reviewer becomes. Answer two is what the builder must
demonstrate. Draft all three yourself from the request, then state them back as
conclusions — "this is a book chapter; done means it reads end to end without
contradicting chapter two; wrong means a claim that is not true" — so the user
corrects a reading rather than performing a classification. A wrong reading stated
plainly is easy to fix; a question about categories is work handed back.

Only where the request genuinely leaves the outcome open — two plausible readings
with materially different work behind them — does this become a question, and even
then ask about the outcome the user wants, never about which category the work
belongs to.

Common shapes, as illustration only — never as a menu to force a request into:

| Shape | Deliverable | Done means | Wrong means |
|---|---|---|---|
| Enhancing existing software | A change in this repo | Tests and the plan's checks pass | Regression, security hole, scope creep |
| Building something new | A working first version | It runs and does the named thing | Wrong foundation, unnecessary complexity |
| Writing and documentation | A document | Complete, accurate, follows its own structure | False claim, contradiction, unusable for its reader |
| Marketing and communication | Copy, campaign, positioning | The audience takes the intended meaning | Overclaim, wrong audience, off-brand |
| Operations and process | A runbook, a config, a migration | Someone else can execute it unaided | Missing rollback, unstated prerequisite |
| Research and analysis | Findings and a recommendation | The conclusion follows from evidence shown | Unsupported leap, cherry-picked data |

A run may be a mix. Record it as a mix — the honest description beats the nearest
label.

Record the track in `state.json` as `track`, with the three answers written into
`00-request.md`. Every subsequent stage reads them before starting, and the words
*build*, *verify*, and *finding* below are always to be read in the track's terms.

---

## Stage 0 — Intake

**Input:** the user's request.
**Output:** `runs/<id>/00-request.md`, `state.json`.

Create the run id as `YYYY-MM-DD-<short-kebab-slug>`. Write the request verbatim —
do not summarize it, since later stages read this instead of the conversation and a
summary is where requirements quietly disappear.

Verbatim includes the mess. Requests arrive as thinking out loud: half-formed,
out of order, self-correcting, with the decisive constraint tucked into an aside near
the end. Capture all of it, in the order it was said, including the parts that were
later revised — the revision only makes sense next to what it revised. Making sense
of that material is the planner's work, not the user's, and the user is never asked
to restate a request more precisely.

Then read the request and infer the track, per the section above. This is the one
moment where the direction of the whole run is set: whether it is an enhancement, a
build from nothing, a document, or work with no code in it at all. Getting it wrong
here is not recoverable later — every stage will do good work aimed at the wrong
target.

The inference is stated in the plan's Framing and confirmed at the plan approval along with
everything else. That is the correction point, and it is enough: the user reads one
sentence and either nods or says "no, this is a blog post". They are never asked to
categorize their own request up front.

Write into `00-request.md`: the verbatim request, the deliverable, what done means,
and what wrong means. Record in `state.json`: `id`, `mode`, `track`,
`stage: "plan"`, `awaiting: null`.

If the request remains ambiguous enough that a plan would be guesswork, ask now. One
round of questions here is cheaper than a rejected plan.

---

## Stage 1 — Plan

**Agent:** planner. **Input:** `00-request.md` (including the track), `memory.md`, and
the existing material — the codebase, the manuscript, the current campaign, whatever
this run builds on. **Output:** `01-plan.md`.

The request is usually one sentence. The planner's first job is to expand it — but by
proposing, not by interrogating. It restates the problem, brings the nearest good
solution, and names the assumptions it took, so the user reacts to something concrete
instead of answering a questionnaire. Correcting a proposal costs a sentence;
answering five questions costs the user the work they came with.

The planner has an opinion: it says which approach it would take and why, and says
plainly when the request as stated will not achieve what the user evidently wants. It
asks outright only when a proposal is genuinely impossible — two readings, materially
different work behind each, nothing available to break the tie — and even then brings
its recommendation with the question. Questions the existing material can answer are
never asked; that is the planner's own work.

The goals stay the user's. The planner may propose a better solution to what was
asked, or argue that the request as stated will not achieve what the user wants, but
it may not widen the goal on its own. Anything beyond the request goes in *Out of
scope suggestions* for a separate decision.

The planner reads code but writes none. Its plan must contain:

0. **Framing** — the problem in the planner's own words: what is wrong now, what
   would be true instead, why it matters, the approach chosen, and the alternatives
   rejected with a reason each. The human checks this first; a wrong restatement
   makes everything after it wrong.
1. **Goal** — one paragraph, in the user's terms, on what will be true when done.
2. **Scope** — what is included, and an explicit *not included* list. The second list
   is what prevents the builder from wandering.
3. **Existing material to reuse** — concrete references: `path:line` for code, section
   or page for a document, the existing asset for anything else. A plan that proposes
   building something that already exists is a failed plan, in any track.
4. **Steps** — ordered, each naming what it touches and what changes.
5. **Verification** — how the result gets proven, in the track's terms: which tests
   and commands for code; which claims get checked against which source for a
   document; who reads it and understands what for communication work; who executes
   it unaided for a runbook. "It should work" is not verification in any track.
6. **Risks** — what could break, what is irreversible, what needs a migration or a
   backup taken first.
7. **Open questions** — assumptions that survived the interview. If this list is
   non-empty, the approval must ask the user about it rather than defaulting.
8. **Out of scope suggestions** — worthwhile things noticed but not asked for, each
   its own proposal. Never folded into a step.

The plan is a proposal, not a decision. It never edits files, runs migrations, or
installs packages.

---

## Plan approval

Controlled by `approvals.plan` (default on), skipped in `auto`.

Present to the user, in this order:

1. The track, the goal, and the top risk — a few lines, not the whole plan file.
2. **The work list**, verbatim from the plan: plain bullets of what will actually be
   done. This is the last thing the user sees before anything is produced, so it must
   be readable on its own, without the plan's reasoning around it.
3. The open questions, **as a pick list** — see below.

Do not dump the whole plan into the terminal; point at its path for the detail.

**Ask with options, not open prose.** Every question the plan raises is put to the
user as a selectable choice with 2–4 concrete options, using whatever mechanism the
tool provides for structured questions (in Claude Code, the AskUserQuestion tool).
The planner writes the options; the main thread renders them, because a subagent
cannot prompt the user directly. Never add an "other" option by hand — a free-text
answer is always available, and the user may ignore the options entirely.

This applies to any question the workflow asks at any stage, not only at this
approval.

**This approval is a conversation, not a form.** The user does not have to type an
approval command. "Yes but drop step three", "do it", "no — I meant the other panel",
"what happens if it fails halfway?" are all valid responses and are handled as what
they plainly are. Answer questions at the approval without treating them as rejections;
a person interrogating the plan is doing exactly what the approval exists for.

Partial approval is normal: apply the modification to the plan, restate what changed
in one line, and proceed on the modified plan. A change large enough to alter the
goal goes back through the planner instead.

Write the outcome to `02-approval.md`: decision, reason, timestamp, and any
modification the user asked for. When the decision is an approval — full or partial —
the same write appends to `runs/<id>/06-backlog.md` every out-of-scope suggestion that
was not folded into the approved scope, plus anything cut from scope at this approval,
each as `open` — see *Backlog* below for the format. The backlog is a candidate list,
not a commitment list, so silence at the approval captures the item rather than losing
it. A rejection appends nothing: there is no approved scope yet to measure against, and
the approval of the revised plan is what captures the items, once. On rejection, hand
the file back to the planner for a revision; do not proceed to implementation on a
rejected plan under any mode.

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

`03-impl.md` must list: what was produced or changed with a one-line reason each,
deviations from the plan and why, verification carried out with its actual result,
and anything deliberately left undone. Report failures honestly; a false claim of
success poisons the review stage, which trusts this report.

---

## Stage 3 — Review

**Agent:** reviewer, with a context that has never seen the builder's reasoning.
**Input:** `01-plan.md`, `03-impl.md`, the track, and the work produced.
**Output:** `04-review.md`.

The track's third answer — *what would make it wrong* — is the reviewer's primary
brief. It reads that first and hunts for it specifically.

Two checks are universal, in every track:

1. **Correctness** — is it true, and does it hold up? For code: logic errors,
   unhandled cases, broken error paths, races, leaks. For a document: false claims,
   internal contradictions, unsupported conclusions. For communication: overclaims,
   and meaning the audience will not take as intended.
2. **Plan conformance** — did the work do what was approved, no more and no less?
   Scope creep is a finding. So is a step quietly skipped.

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

---

## Stage 4 — Fix loop

Governed by `auto_fix`. See the skill's fix-loop section for the exact behavior.

Each iteration writes `05-iterations/NN-fix.md` (what the builder changed) and
`NN-recheck.md` (what the reviewer found afterward). The loop ends when the reviewer
reports nothing at or above the threshold, or `max_iterations` is reached.

A finding the loop could not close is escalated to the user with the reviewer's
description intact — never quietly downgraded to make the run look clean.

---

## Backlog

Every run produces work it deliberately does not do. Three sources, all already
written down by the time a run ends:

1. Out of scope suggestions the planner listed and the user did not fold into the
   approved scope.
2. Findings below `auto_fix.min_severity`, and findings the fix loop could not close.
3. Debts deferred at an approval because they fell outside the approved scope.

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

## Final approval

Controlled by `approvals.review`, skipped in `auto`.

Report: what was built, verification results, findings fixed, findings still open,
and anything the builder noted as out of scope. Then stop. Committing, pushing, or
opening a pull request happens only if the user asks.

Before setting `stage: "done"`, append the same three categories just reported —
findings still open, findings below the fix threshold, and the builder's out-of-scope
notes from `03-impl.md` — to `runs/<id>/06-backlog.md`, each as `open`, in the format
given in *Backlog* above. Every input is already assembled at this moment; the only
change is that it is written down rather than spoken and discarded.

Set `stage: "done"` in `state.json` once the user accepts.

---

## Resume semantics

Any tool picking up a run reads `state.json` and continues from `stage`, honoring
`awaiting`. A run whose `awaiting` is non-null must not be advanced without a
recorded decision in `02-approval.md`. This is what makes a run safe to hand between
Claude Code, Codex, and Antigravity mid-flight.
