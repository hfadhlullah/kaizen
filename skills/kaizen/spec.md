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

Evidence about software whose source is not at hand — a shipped binary, an app
bundle, an APK, a package — comes from REA (`rea-agents`) when its tools are
connected in the session: cite what it returns, limitations included. When they are
not connected, say the claim is unverified rather than guess at internals.

Record the track in `state.json` as `track`, with the three answers written into
`00-request.md`. The description stays free; the stored `track` word is the nearest of
`code`, `writing`, `communication`, `operations`, `research`, or a new word where none
fits (a mix joined with `+`), because `kaizen recall --track` looks lessons up by it. Every subsequent stage reads them before starting, and the words
*build*, *verify*, and *finding* below are always to be read in the track's terms.

---

## Stage 0 — Intake

**Input:** the user's request.
**Output:** `runs/<id>/00-request.md`, `state.json`.

Create the run id as `YYYY-MM-DD-<short-kebab-slug>`. Write the request verbatim —
do not summarize it, since later stages read this instead of the conversation and a
summary is where requirements quietly disappear. The board also finds a run's card by
this text: a request that does not contain the user's words leaves their task as a
second card. Context you add goes below the verbatim text, never in place of it.

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
and what wrong means. Record in `state.json`: `id`, `mode`, `runner`, `agent`, `track`,
`stage: "explore"` when included (otherwise `"plan"`; `review-only` starts at `"review"`), `explore_status` (`active` or `skipped`), `awaiting: null`, `iteration: 0`, and `updated` — the time of this
write, refreshed on every later one.
A `lite` run also records `review_executor` (`inline` or `subagent`, from `review.executor`, `ask` resolved) once it is known, and a resumed run keeps it.
Where the environment has `CLAUDE_CODE_SESSION_ID`, also record it as `session`: the
board keeps the run on the card it was launched from by that id.

`stage` takes exactly one of six words, and boards key their columns on them:
`explore`, `plan`, `build`, `review`, `done`, `abandoned`. Set it when the stage starts —
`build` before the builder touches anything, `review` before the reviewer reads — as
its own write, not tacked onto a longer command that may not finish. Fixing findings
is building and a recheck is reviewing, whoever runs them and whether the loop or the
user picked the findings: `build` with `iteration` raised and `awaiting: null` before
each iteration's first edit, `review` before its recheck reads. Any other word
(`implement`, `fix`, `building`) is unknown to every reader and shows as still planning.
After intake, where `kaizen --version` prints 1.69.0 or later, write these keys with
`kaizen state <id> stage=build awaiting=null` (`iteration=<n>` likewise): one atomic
write that refuses unknown words and stamps `updated`. An older `kaizen` reads `state`
as a plain `kaizen` call and starts the installer, so there, and where no `kaizen` is
installed, edit `state.json` by hand in its two-space JSON layout. Finish with
`kaizen done <id>` either way.

`awaiting` is `null` or the config key of the approval being waited on —
`approvals.plan`, `approvals.review`, `approvals.each_file` — or `findings` when the
run has stopped for the user to pick which review findings to fix. `explore` means the Explore brief is ready for the user to confirm; interview rounds use `kaizen report blocked` with `awaiting: null`. Boards read it to
say what a run is waiting for and where it sits; a word outside this list is shown but
not understood.

`agent` is the tool this run is happening in — `claude`, `codex`, `agy`, `opencode`,
`gemini`, or `cursor` — written once at intake and never changed, so a board can say
which agent to look for when a run is waiting. The tool running this stage knows what
it is; no detection is needed.

`runner` is read from config at intake and written down here, because it decides
whether the stages that follow are separate agents or this one. A run resumed later
keeps the runner it started with: a review done in the same session as the work is a
different thing from an independent one, and which happened should not depend on what
the config said the day someone came back to it.

If the request remains ambiguous enough that a plan would be guesswork, ask now. One
round of questions here is cheaper than a rejected plan.

**Short work is not skipped.** Even a one-line change gets `01-plan.md` and `04-review.md`, so the run moves through every stage. Keep them brief and run under `runner: lite`; a `high`+ finding still enters the fix loop, on that same runner.

**Follow-ups are runs too.** Both runners record the same artifacts: `01-plan.md`, `03-impl.md`, `04-review.md`, and a final `state.json` — `lite` and `full` differ only in who executes the stages. A message the user sends later in the same session is judged by what it asks: a question, explanation or chat is answered, no run; a request to change or produce something is building, so it goes through the flow. While the previous run has not reached `done` (including awaiting its final approval), the change is a revise of that run, recorded in `02-approval.md`. After `done` or `abandoned`, ask the user before opening a new run — AskUserQuestion with *open a follow-up run*, *answer without a run*, *cancel* — and create nothing under `runs/` until they pick the first. An explicit `/kaizen <request>` is that answer already. The new run's `00-request.md` is the user's words verbatim, then a line `Follow-up of: <previous run id>`; where those words only answer a question ("Plan 2b next"), put one line naming the work first — the board titles the card from it. Never reopen a finished run. When unsure whether a message asks for a change, ask once.

---

## Before Plan — optional Explore

Read the intake rules in the kaizen skill. `explore.enabled: false` is the default;
explicit per-run choices take precedence. Clear fixes skip this phase. If included,
run the kaizen-explore skill in the main thread and save `00-explore.md` before Plan.
On confirmation set `explore_status=completed stage=plan awaiting=null`; on skip
preserve partial work and set `explore_status=skipped stage=plan awaiting=null`.
Unblock any interview report. A stop abandons the run. Neither exit bypasses normal
plan approval. Legacy runs and resumed runs never gain Explore automatically.

## Reporting to the board

Every stage reports with `kaizen report`, under every runner. From the moment the run
id exists, pass `--run <id>` unless `KAIZEN_RUN_ID` is set. A failed report never stops
the work. Windows has no `KAIZEN_RUN_ID`, and a new run gets one only once resumed.

- `kaizen report phase "<what you are doing>"` at the start of the stage and at each
  Work list step. These are the run's heartbeat.
- `kaizen report blocked "<question>" --options a,b` when only the user can answer,
  instead of stalling or guessing. Then stop and ask; `kaizen report unblock` once answered.
- `kaizen report done --stage <explore|plan|build|review> --outcome succeeded|failed --summary "<3 sentences>" --files a,b`
  as the stage's last act. A build or review that ends without it shows as unverified.

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

## Persistent Task protocol

A board Task has a durable UUID independent of its title and linked workflow runs.
The launch prompt supplies the task id, frozen policy, current result, input ids,
current CLI command and this source contract. Use that command when a global
installation is older. Never replace task identity, broaden permissions, or silently
switch agents. Both full and lite runners honor the persisted task policy before
reading global auto/approval defaults.

Task intake/planning may ask questions and propose an outcome, but must not produce
until the current plan is explicitly approved. Use the sanctioned state command;
it rejects build/review/done before that approval. Do not overwrite task_policy,
task_id or task_confirmed by hand. The user may decide in any of three places: the task
page, the run panel, or by typing to you. The board records the first two; record a
decision typed to you with the `approved` or `answered` event below. The final yes on
the result is `kaizen done <run> --user-approved`; it also accepts the task.

Read context with `kaizen task show --task <uuid>`. Publish structured events with
`kaizen task event --task <uuid> --run <run-id> --operation <stable-event-id> --json '<event>'`.
Use a stable operation id on retries. The launcher gives the launch id and dispatched
input ids; acknowledge the launch before doing anything else:

- `{"type":"ack","launchId":"<launch-id>"}` acknowledges delivery, not completion.
- `{"type":"reply","text":"..."}` is a user-facing explanation.
- `{"type":"question","text":"...","options":["..."]}` requests material input.
- `{"type":"proposal","text":"outcome, constraints and checks","details":"full plan"}`
  requests explicit confirmation of this run/iteration/result. Stop production here.
- `{"type":"approved"}` records that the user approved the current plan by typing to
  you in the agent terminal. Send it only on a clear yes, then continue the build.
- `{"type":"answered","text":"..."}` records the user's answer to your open question (or
  their plan changes) given in the agent terminal, so the task and run pages stop asking.
- `{"type":"work","text":"..."}` reports genuine production after confirmation.
- `{"type":"receipt","inputIds":["..."],"outcome":"applied"}` acknowledges only
  dispatched input ids. Use `failed` and `error` for requests not applied.
- `{"type":"boundary","text":"..."}` promises no active writes and no dispatched
  input awaiting acknowledgement. Only this acknowledged safe boundary or a completed
  result enables the next queued batch. Do not infer safety from terminal quiet.
- `{"type":"result","title":"...","summary":"...","artifacts":[{"path":"output.md"},
  {"url":"http://localhost:3000","name":"Live preview"}],"checks":["what actually passed"],
  "limitations":["what remains unverified"]}` preserves settled deliverable files and
  publishes a typed version. Paths must be regular files inside the project/worktree.
  Do not snapshot source trees or databases. HTML/SVG files download only. Include
  specialized Video identity as `video:{name,letter,revision}` when relevant, without
  changing its recipes. A refused result does not pause the task; fix the cause and publish again.
  Only a failed copy to disk pauses it, retains earlier versions and needs recovery.

A question/status reply never authorizes production. Queued change requests are not
already applied: keep their ids and report receipts. Stop requests cancellation and
never rollback. Reconcile ambiguous launches/edits on explicit resume; do not replay
unacknowledged work blindly. Material scope changes publish a new proposal; routine
revisions reuse the accepted direction. Feedback sent from the task page explicitly
authorizes a linked follow-up after done/abandoned, so do not ask the user to manage
run types or reopen a finished run. Preserve `Follow-up of:` and task id. This is the
Task-specific exception to the general follow-up confirmation rule.

Task acceptance (Looks good) is distinct from workflow completion, technical git
housekeeping and publication. Finish genuine checks and workflow decisions, publish
checks/limitations honestly, then leave the completed result for user acceptance.
A rendered event form is not evidence of registration storage or delivery.
