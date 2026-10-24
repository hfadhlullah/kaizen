# Kaizen — plan stage

Read with [`spec.md`](spec.md) (core: track, intake, resume). This file is the
planner's and the plan approval's contract. The builder and reviewer do not read it.

---
## Stage 1 — Plan

**Agent:** planner. **Input:** `00-request.md` (including the track), `notes.md` in
the run directory when present — links, paths, and background the user attached from
the board, binding like the request itself — `memory.md`, `notes/Project/Index.md` in the state
directory when present — the project's map, written by `/kaizen docs`; open only the
notes it lists for areas the request touches — and the existing material —
the codebase, the manuscript, the current campaign, whatever this run builds on.
**Output:** `01-plan.md`.

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

**Offer REA for what exists but is not here.** In every run and every track: when the
request or what came with it names something that already exists but whose source is
not at hand — an app or site to copy, replace or integrate with, an APK or IPA, a
binary, a package, a file format, a device or its firmware, a protocol or a capture —
and REA's tools are connected in the session, the plan asks once:
`Q: Study <the thing> with REA first?`, with `yes` (recommended where how it works
inside decides the design) and `no`. Under `runner: lite` or an inline planner, a yes
given before the plan is written lets the planner run REA itself and plan from what it
found. Under `full`, where the planner has no REA tools, the main thread runs the study
on a yes, writes what it found to the run's `notes.md`, and dispatches the planner
again; a yes given at the plan approval instead makes the study the build's first
step. What REA
returns is cited with its limitations, as *the track* in `spec.md` already requires.
REA not connected: ask instead
`Q: REA isn't installed — set it up first?`, with `help me install it` (recommended
where how it works inside decides the design), `I'll install it myself` and `skip
REA`. On *help me install it* the main thread follows REA's own setup: it runs
`npx -y rea-agents@<version> doctor --client <client> --json` — the version pinned,
as REA's own guide pins it, taken from `npm view rea-agents version` and shown to the
user; the client from the run's `agent` (`claude` → `claude_code`, `codex` → `codex`,
`agy` → `antigravity`, `opencode` → `opencode`, `gemini` → `gemini_cli`, `cursor` →
`cursor`) — then `setup --client <client> --dry-run --json` with the same version, shows the user the exact files it
would change, and runs `setup --client <client> --yes` only after they approve it —
setup writes the agent's own configuration, so it is never run unseen, in any mode.
On *I'll install it myself* it gives that same command and waits. Either way the new
tools appear only after the agent restarts: say so, and the run resumes from its
`state.json`, the yes to REA recorded beforehand in `02-approval.md` so the resumed
session studies the thing rather than asking again. REA's prerequisites (Node, and
Java, Ghidra or JADX for some targets) are named where doctor reports them missing,
never installed by the run. On *skip REA*, or when setup fails, the plan says so
once and claims about that thing's internals are marked unverified. Nothing of the
kind named: REA is not mentioned.

**Building from nothing is the exception: settle the foundation first.** When the
track is a new product or app, there is no material to answer the questions that
decide everything after them, and "wrong" for this track is a wrong foundation — the
one thing a review cannot fix, because fixing it is a rebuild. Before the steps are
written, the plan states a decision for each of: platform (web, mobile, PWA, native,
CLI), who and how many will use it, stack, how it is distributed and reached, access
(open, invite, accounts), what data is kept and where, and hosting. Each is either
read from the request, proposed with its reason, or — where two answers lead to
materially different builds — put to the user as an *Open question* with options,
all in one round, before anything is built. Three quick questions and a default for
the rest is how a run ends up writing the second app instead of the first.

**A whole application is a roadmap, not a run.** When the track is a new product or
app — web, mobile, PWA, desktop, anything — and it covers more than one independent
module, one run cannot hold it: the plan, the diff and the review all outgrow what a
reader can check. A single screen or a single feature stays one run. The Framing says
in one line that the plan is a roadmap, so the user can refuse it. A roadmap plan adds
three sections right after the Goal, each written for a person, and the
foundation round above becomes up to three rounds:

- **`## Discovery`** — the planner goes deep before it designs. It reads everything the
  user brought first (decks, forms, sheets, screenshots, an existing repo, REA's
  findings), then asks only what is still open, in up to three rounds of `Q:` pick
  lists, each question with a recommended option: (1) purpose, who uses it and in what
  roles, what it replaces; (2) the flows of each module and their domain rules;
  (3) the foundation choices, among them how it ships, as a multi-select — full CI/CD
  (tests and deploy on every merge), Docker (an image and a compose file that run
  anywhere), a managed platform (Vercel, Fly, Railway or similar), mobile app ready
  (store builds with signing, for example Capacitor or Expo/EAS), or a simple manual
  deploy — and, where the app has a screen and no design system exists, its look and
  feel, asked as item 7 *Design direction* below says: the feel (for example rich and
  animated, calm and simple, enterprise and dense, gen-z and playful) and how much
  motion. A round with nothing left to ask is skipped. Under `runner: full` the
  planner writes `01-plan.md` with the Framing, `## Discovery` so far and the round's
  questions as *Open questions*, and no `## Roadmap`, then stops; that file is a
  round, not a plan. The main thread asks them and dispatches it again with the
  answers. Under
  `lite` or inline, the session asks them directly. The section records the roles, the
  main flows, the things the app keeps track of and how they relate, a glossary of
  the domain's words, and every answer given.
- **`## Foundation`** — a decision with its reason, derived from Discovery, for each
  of: platform; frontend (framework, UI kit, state, the design direction chosen);
  backend (runtime, framework, API style); the contract between them (REST, RPC or
  realtime, and where its types live); hosting and deploy, as chosen in discovery;
  database (engine, where it runs, the main tables or collections and their
  relations, how migrations are done); auth and access; repo layout and conventions.
  Every increment builds on it.
- **`## Roadmap`** — the increments, numbered, one line each:
  `N. <title> — <what it delivers> — after: #a, #b` (or `any time`), with
  `— blocked: <reason>` when something outside the work holds it. Increment 1 is always
  the skeleton: the scaffold, the stack wired, the database schema and migration setup,
  an auth stub, and a deploy of the empty app the way the Foundation ships (in its
  Docker image, through its pipeline, as a store test build). Every feature increment
  after it is one feature end to end — its screens, its API, its tables and migration,
  and its tests — so each can be tried on its own; splitting by layer ("all the APIs", then "all the screens")
  is only for an app with no UI or no backend. Each increment is sized to one ordinary
  run. Where real people will use the app, the last increment is going live: what
  the deploy choice still needs (the full pipeline, the production image, store
  listings and release builds), backups, monitoring and error tracking, and the
  production deploy. A last line says which must go in order and which can start any
  time.

The rest of a roadmap plan — Work list, Steps, File manifest, gate — covers increment 1
only; it is this run's build. The others become child cards at the approval (see
*Child cards* in `spec-main.md`).

**An increment run builds inside its parent's decisions.** A request with a `Parent:`
line whose parent run's `01-plan.md` has a `## Roadmap` is an increment. Its planner
reads that plan's Discovery, Foundation and its own Roadmap line before anything else.
They bind it: a deviation from the Foundation is an *Open question* to the user, and a
change to the roadmap is an *Out of scope suggestion*, never a silent edit of the
parent's plan.

The goals stay the user's. The planner may propose a better solution to what was
asked, or argue that the request as stated will not achieve what the user wants, but
it may not widen the goal on its own. Anything beyond the request goes in *Out of
scope suggestions* for a separate decision.

The planner reads code but writes none. Its plan must contain:

0. **Framing** — the problem in the planner's own words, as a few short labelled
   bullets rather than a paragraph: **Problem** (what is wrong now, as the user meets
   it), **Fix** (what will be true instead, and the approach), **Rejected** (each
   alternative with its reason, one line), then the track in one line. The human
   checks this first; a wrong restatement makes everything after it wrong.

   Right below it, the **Work list**: plain bullets, one line per thing that will
   actually be done, written for someone who has not read the rest of the plan.
   Five bullets is usually plenty. It sits second so the reader learns what will
   happen before the detail; the plan approval shows it verbatim and the builder
   tracks progress against it.
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
7. **Design direction, for any work with a visual surface** — a website, a landing
   page, a UI, a deck, a printed piece. The direction is settled before the builder
   starts, because it is the one decision that cannot be changed afterwards without
   redoing the work: copy survives a re-skin, markup does not.

   Look for it in the material first — a `design.md`, a design system, a brand or style
   guide, an existing stylesheet with established tokens. Where one exists, the plan
   names it and follows it, and asks nothing; the answer is already in the repository.

   Where none exists, the direction is an *Open question* with 3-4 concrete options,
   each named for what it signals rather than for its palette, so the user chooses a
   positioning rather than a color. Bringing one direction and building it is the
   failure this item exists to prevent: the planner has an opinion here as everywhere
   else, but a visual direction chosen silently is a decision taken from the user, not
   a proposal made to them.

8. **Risks** — what could break, what is irreversible, what needs a migration or a
   backup taken first.
9. **Open questions** — assumptions that survived the interview. If this list is
   non-empty, the approval must ask the user about it rather than defaulting. The
   board shows a waiting plan's questions as a pick list and sends the answers with
   its approval, so keep this shape: each question on its own line as
   `Q: <question>`, its options beneath as `- <label> (recommended) — <why>`, the
   label short since it is what is sent back, `(multi-select)` in the question when
   several may be picked, and `None.` when there are none.
10. **Out of scope suggestions** — worthwhile things noticed but not asked for, each
   its own proposal. Never folded into a step.

The plan is a proposal, not a decision. It never edits files, runs migrations, or
installs packages.

**Length is a cost the whole run pays.** Every later stage reads this file, and the
fix loop reads it again per iteration, so a line written once is read five or six
times. Sections 3 to 6 — the material to reuse, the file manifest, the steps, the
verification — earn their length: they are what stop every later stage searching the
material again, and cutting them costs more than it saves. Sections 0 (Framing and the
Work list), 1, 8 and 10 are read once by a human at the approval and should be as
short as they can be and still be correct: a few labelled lines of framing, a short
work list, a paragraph of goal, the risks that are real, the
questions that are open. An alternative rejected gets a line saying what and why, not
a case against it.

**Write the parts a person reads for a person.** Framing, the Work list, Goal, Scope,
Discovery, Foundation, Roadmap, Risks and Out of scope suggestions are read by someone deciding whether to approve,
often on a narrow panel. Write them in everyday words: short sentences, one idea per
bullet, things named by what the user sees ("the chat bubble", "the Plan tab") rather
than by function, file, CSS value or gate id. Code names, `path:line` and gate ids
belong in Reuse, the File manifest, Steps and Verification, where the builder and
reviewer need them exact. If a sentence only makes sense to someone who has read the
code, it is in the wrong section.

A plan whose framing is longer than its steps is a plan that spent the run's budget
explaining itself.

---

## Plan approval

Controlled by `approvals.plan` (default on), skipped in `auto`.

Present to the user, in this order:

1. The track, the goal, and the top risk — a few lines, not the whole plan file.
2. **The work list**, verbatim from the plan, where it sits right after Framing:
   plain bullets of what will actually be done. This is the last thing the user sees before anything is produced, so it must
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

