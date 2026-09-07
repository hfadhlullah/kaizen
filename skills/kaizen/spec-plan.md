# Kaizen — plan stage

Read with [`spec.md`](spec.md) (core: track, intake, resume). This file is the
planner's and the plan approval's contract. The builder and reviewer do not read it.

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
4. **File manifest** — every path this run will read or change, as a flat list. The
   planner already located them; the builder and the reviewer read this list instead
   of searching the material again. A path missing here is a path the later stages
   will have to find twice.
5. **Steps** — ordered, each naming what it touches and what changes.
6. **Verification** — how the result gets proven, in the track's terms: which tests
   and commands for code; which claims get checked against which source for a
   document; who reads it and understands what for communication work; who executes
   it unaided for a runbook. "It should work" is not verification in any track.

   Write this as a **numbered gate** — `G-01`, `G-02`, … — derived from the track's
   third answer, *what would make it wrong*. The numbering is per run, not a standing
   catalogue: the sixth kind of work still gets a real gate because its gate is
   written from its own request rather than looked up. Each item is one checkable
   question, and each carries a tier, which is where its severity comes from:

   - **block** — the run is wrong if this fails. Reviewer severity `critical` or `high`.
   - **reason** — the thing is allowed, but the builder must write down why. An
     unexplained new dependency, abstraction, file, or section fails this tier.
     Reviewer severity `medium`.
   - **lock** — consistency with what is already there. Reviewer severity `low`.

   Phrase every item so the answer is yes or no. "Handles errors well" is not a gate
   item; "every new query path has a covering test" is. A tier fixes the severity
   before the reviewer has an opinion, which is what stops the same class of problem
   being `high` in one run and `medium` in the next.
7. **Risks** — what could break, what is irreversible, what needs a migration or a
   backup taken first.
8. **Open questions** — assumptions that survived the interview. If this list is
   non-empty, the approval must ask the user about it rather than defaulting.
9. **Out of scope suggestions** — worthwhile things noticed but not asked for, each
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

**Who builds it.** Governed by `build.executor`. On `subagent` or `inline` the
approval says which is about to happen in one line and moves on; on `ask` it is one
more choice at this approval:

- **subagent** (default) — dispatch the builder as its own agent. The main thread
  keeps its context, and the work is reported back rather than watched. Right for
  most runs, and the only sane option for a large one.
- **inline** — the main thread does the work itself, against this plan. You watch it
  happen and can interrupt mid-step, and it already holds the conversation the plan
  came out of. It costs main-thread context, and a long run will exhaust it.

Either way the builder's contract is unchanged: the plan is the scope, `03-impl.md`
is written the same way, and the gate is answered with the same evidence. **The
reviewer is always a separate agent, in both.** Its independence is what the review
is worth, and it is not the user's to trade away — an inline build is judged by an
agent that never saw it happen, exactly as a dispatched one is.

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
the approval of the revised plan is what captures the items, once.

**A rejection is one of two different things, and the reason says which.** "Do it
differently" is a revise: hand the file back to the planner with the reason, it
produces a new `01-plan.md`, and the run returns to this same approval. "Not doing
this" is a kill: the request itself was wrong, not just the approach — mark
`stage: "abandoned"` in `state.json` and stop; there is nothing to revise toward.

Read the reason to tell which. Revise-shaped: disagreement with an approach, a step,
a scope boundary, an assumption — anything where a different plan would be accepted.
Kill-shaped: the goal is no longer wanted, was based on a misunderstanding now
resolved outside the plan, or a "no" with no implied alternative. When genuinely
unclear, state which reading was taken in `02-approval.md` rather than guessing
silently — a wrong revise wastes one planner cycle; a wrong kill discards a plan that
should have been fixed instead, silently and without a record.

Either way, do not proceed to implementation on a rejected plan under any mode. A
revised plan returns through this same approval; a killed run's `stage` never advances
past `"abandoned"`.

