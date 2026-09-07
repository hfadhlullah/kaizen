---
name: kaizen-help
description: >
  Quick-reference card for the kaizen workflow: commands, modes, approvals,
  fix loop, config knobs, state layout, backlog/status rules. One-shot
  display, not a persistent mode. Trigger: /kaizen-help, "kaizen help",
  "what kaizen commands", "kaizen cheat sheet".
---

# Kaizen Help

**Print the content of this card into your reply.** The user cannot see this file —
it loads into your context only, so summarizing it or saying "see above" shows them
nothing. Output the tables themselves.

One-shot: do NOT change kaizen's active mode, write to `state.json`, or persist
anything.

## Commands

| Invocation | Action |
|---|---|
| `/kaizen <request>` | Start a new run in the configured mode (default: `approve`) |
| `/kaizen plan <request>` | Start a run and stop after the plan (`plan-only`) |
| `/kaizen auto <request>` | Start a run in `auto` mode: every stage back to back, no approval stops |
| `/kaizen lite <request>` | Run the stages in this session — cheap, reviewer has seen the work |
| `/kaizen full <request>` | Dispatch each stage as its own cold agent |
| `/kaizen run` | Resume the current run and execute the approved plan |
| `/kaizen review [target]` | Review-only: audit existing code, no plan, no implementation |
| `/kaizen status` | List every run grouped waiting-on-you / in flight / done / abandoned, plus open backlog count |
| `/kaizen backlog` | Print open backlog items across all runs, grouped by source run, rescued items last under `Orphaned` |
| `/kaizen approve` | Approve whatever the current run is waiting on |
| `/kaizen reject <reason>` | Reject it; the reason decides revise (back to planner) vs kill (abandon) |
| `/kaizen abort` | Mark the current run abandoned |
| `/kaizen config` | Show this project's settings and change them, one picker per setting |
| `/kaizen init` | Set up this project folder: `.kaizen/` with `spec.md`, config, and — in a git repo — the gitignore entry |
| `/kaizen install` | Install the workflow itself globally or per-project |

`/kaizen` with no argument: `status` if a run is in progress, else ask what to build.

## Modes

Set by `mode` in config, overridable per invocation.

| Mode | What it does |
|---|---|
| `plan-only` | Produce the plan, write it, stop. No code touched. |
| `approve` (default) | Stop at every enabled approval, wait for an explicit decision. |
| `auto` | Run every stage back to back, no approval, report at the end. Fix loop still respects `max_iterations`. |
| `review-only` | Skip plan and implementation, run the reviewer against existing code or a diff. |

Mode never overrides a refusal: destructive/irreversible actions still confirm even in `auto`.

## Approvals

- `approvals.plan` — after the plan, before any code is written.
- `approvals.review` — after the review passes, before the work is called done.
- `approvals.each_file` — confirm each file edit individually. Off by default; slow.

A rejection is written to the run directory, and is one of two things — the reason
says which. **Revise** ("do it differently") goes back to the planner, which produces
a new plan and returns to the same approval. **Kill** ("not doing this") means the
request itself was wrong: set `stage: "abandoned"` and stop, nothing to revise toward.

## Fix loop

- `auto_fix.enabled: false` — every finding stops the run, becomes a user decision.
- `auto_fix.enabled: true` — builder fixes findings at or above `auto_fix.min_severity`,
  reviewer re-checks, up to `auto_fix.max_iterations` rounds. Findings below threshold,
  and anything still open when iterations run out, are reported to the user.

Each iteration is written to `runs/<id>/05-iterations/`.

## Config knobs (`config.default.yml` defaults)

| Key | Default | Meaning |
|---|---|---|
| `preset` | `medium` | Quick preset (`low`, `medium`, `ultra`, `custom`) |
| `mode` | `approve` | Default run mode |
| `runner` | `full` | `full`: each stage a cold subagent. `lite`: this session runs every stage |
| `approvals.plan` | `true` | Stop after the plan |
| `approvals.review` | `false` | Stop after the review |
| `approvals.each_file` | `false` | Confirm every file edit |
| `build.executor` | `subagent` | Who builds: `subagent`, `inline` (main thread), or `ask` at the approval |
| `auto_fix.enabled` | `true` | Auto-fix findings vs. escalate everything |
| `auto_fix.min_severity` | `high` | Threshold for auto-fix (`critical\|high\|medium\|low`) |
| `auto_fix.max_iterations` | `2` | Fix/recheck rounds before escalating remaining findings |
| `track.default` | `""` (empty, inferred per run) | Pin a track for a repo that is always one kind of work |
| `review.write_memory` | `true` | Let the reviewer append lessons to `.kaizen/memory.md` |
| `backlog.enabled` | `true` | Capture what a run deliberately did not do |
| `backlog.file` | `06-backlog.md` | Per-run backlog file |
| `backlog.orphan_file` | `backlog.md` | Where a pruned run's open items are rescued to |
| `state.dir` | `.kaizen` | State directory |
| `state.keep_runs` | `20` | Completed runs kept before pruning oldest (rescues open backlog first) |
| `git.auto_commit` | `false` | Never commit/push/PR unless the user explicitly asks |
| `git.branch_before_implement` | `true` | Branch before implement stage when on the default branch |
| `agent.default` | `auto` | Coding agent to launch from dashboard backlog |

`.kaizen/config.yml` overrides only the keys it sets; everything else falls back to
this skill's `config.default.yml`.

## State layout

```
.kaizen/{spec.md, config.yml, memory.md, backlog.md (orphanage)}
.kaizen/runs/<id>/{00-request,01-plan,02-approval,03-impl,04-review}.md,
  05-iterations/, 06-backlog.md, state.json (id, mode, stage, awaiting, iteration, updated)
```

## Backlog and status

Backlog items: `- <status>: <item text>`, `<status>` one of `open`, `done`, `rejected`
(`rejected` carries a reason after `|`). `/kaizen backlog`/`status` are **read-only** —
never edit `06-backlog.md` or `state.json`, even to fix a spotted inconsistency; report
it and ask.

`/kaizen status` groups every run by `state.json` at read time: **Waiting on you**
(awaiting non-null, not abandoned), **In flight** (awaiting null, not done/abandoned),
**Done**, **Abandoned**, plus `Backlog: <n> open` (all runs + orphanage; abandoned
runs' items excluded).

## More

Full walkthrough and rationale: `~/.claude/skills/kaizen/README.md`. Full stage
contract: `~/.claude/skills/kaizen/spec.md`. Codex/Antigravity porting:
`~/.claude/skills/kaizen/adapters.md`.
