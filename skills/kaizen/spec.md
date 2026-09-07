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
and what wrong means. Record in `state.json`: `id`, `mode`, `runner`, `track`,
`stage: "plan"`, `awaiting: null`.

`runner` is read from config at intake and written down here, because it decides
whether the stages that follow are separate agents or this one. A run resumed later
keeps the runner it started with: a review done in the same session as the work is a
different thing from an independent one, and which happened should not depend on what
the config said the day someone came back to it.

If the request remains ambiguous enough that a plan would be guesswork, ask now. One
round of questions here is cheaper than a rejected plan.

---

## Stage files

Read core (this file) plus the one file for the stage being run. Nothing else.

| Reader | Reads |
|---|---|
| Planner | `spec.md` + [`spec-plan.md`](spec-plan.md) |
| Builder | `spec.md` + [`spec-build.md`](spec-build.md) |
| Reviewer | `spec.md` + [`spec-review.md`](spec-review.md) |
| Main thread | `spec.md` + [`spec-main.md`](spec-main.md), plus the stage file for an approval it is presenting |

---

## Resume semantics

Any tool picking up a run reads `state.json` and continues from `stage`, honoring
`awaiting`. A run whose `awaiting` is non-null must not be advanced without a
recorded decision in `02-approval.md`. This is what makes a run safe to hand between
Claude Code, Codex, and Antigravity mid-flight.
