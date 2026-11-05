---
name: kaizen-help
description: >
  Quick-reference card for the kaizen commands, with pointers to the
  full docs. One-shot display, not a persistent mode. Trigger: /kaizen-help, "kaizen help",
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
| `/kaizen lite <request>` | Run the stages in this session — cheap, reviewer has seen the work (unless `review.executor: subagent`) |
| `/kaizen full <request>` | Dispatch each stage as its own cold agent |
| `/kaizen run` | Resume the current run and execute the approved plan |
| `/kaizen review [target]` | Review-only: audit existing code, no plan, no implementation |
| `/kaizen status` | List every run grouped waiting-on-you / in flight / done / abandoned, plus open backlog count |
| `kaizen done <id> [--user-approved]` | Finish a run; refused while the review gate waits on the user, `--user-approved` after a clear yes in chat |
| `kaizen state <id> key=value ...` | (1.69.0+) Set a run's `stage`, `awaiting` or `iteration` in `state.json`; refuses words no board knows (`done` goes through `kaizen done`) |
| `kaizen stats [<id>] [--json]` | (1.69.0+) Fix-round and CANNOT VERIFY rates, stage times, tokens for one run |
| `kaizen related <path> ...` | (1.69.0+) Earlier runs that changed these files |
| `kaizen game assets [--check]` | Download the Game page's 3D scenes (forest, dungeon, town; about 17 MB) into `~/.kaizen/game/assets/`; `--check` lists what is there |
| `kaizen game skills [--json]` | The guild and skill ids of the game; the planner picks its `Skill:` and `Guild:` lines from it |
| `/kaizen backlog` | Print open backlog items across all runs, grouped by source run, rescued items last under `Orphaned` |
| `/kaizen gather` | Read request sources kaizen cannot read by itself; their requests land in the icebox, nothing starts |
| `/kaizen discover` | Group what is in the icebox and promote the tasks you pick; nothing starts |
| `/kaizen docs [lint]` | Write or refresh the project's docs vault in the notebook, which agents read first; `lint` only reports what is stale, broken or uncovered |
| `kaizen automation list\|add\|run <id>\|pause <id>\|resume <id>\|rm <id>\|runs <id>` | Schedules that start an unattended auto-mode run in this project (hourly, daily, weekdays, weekly or cron; optional precheck). Fires only while a board runs |
| `kaizen worker init\|start <wid>\|status\|config\|merge\|set <run> on\|off` | Orchestration (off by default): split a run into workers, each in its own board terminal and folder. `kaizen worker report` is for the workers themselves |
| `/kaizen concept [number] <brief>` | Make product concepts as clickable prototypes and get one approved before any build |
| `/kaizen roadmap [next [name] \| run [name]]` | List roadmaps, start or resume the next phase, or run the remaining phases; a project too big for one run, of any kind |
| `/kaizen approve` | Approve whatever the current run is waiting on |
| `/kaizen reject <reason>` | Reject it; the reason decides revise (back to planner) vs kill (abandon) |
| `/kaizen abort` | Mark the current run abandoned |
| `/kaizen config` | Show this project's settings and change them, one picker per setting |
| `/kaizen init` | Set up this project folder: `.kaizen/` with the `spec*.md` files, config, and — in a git repo — the gitignore entry |
| `/kaizen install` | Install the workflow itself globally or per-project |
| `kaizen preview <localhost url \| image>` | Show a change in the board (page → Browser tab, screenshot → Preview tab), not a new browser window |
| `kaizen recall [--track t] [--tags a,b] [--query "<words>"]` | Lessons from other projects that match (global knowledge, `~/.kaizen/knowledge/`) |
| `kaizen remember --track t --tags a,b --applies "<where>" --run <id> "<lesson>"` | Save a lesson that holds beyond this project; the reviewer calls it |

`/kaizen` with no argument: `status` if a run is in progress, else ask what to build.

## More

Read these from the `kaizen` skill folder, which sits beside this one:

- Modes, approvals, fix loop, state layout: `SKILL.md`
- Every setting and its default: `config.default.yml`
- Settings you can pick from: `settings.md`
- Full walkthrough: `README.md`
- Stage contract: `spec.md`
- Porting to other tools: `adapters.md`

`kaizen settings` opens every setting in a terminal.
