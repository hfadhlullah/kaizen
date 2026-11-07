---
description: worktree, handoff, done, worker, automations, preflight, model and other agent-called commands
tags: [project, cli]
sources: [cli/preflight.ts, cli/subagent-model.test.ts, cli/automations.ts, cli/workers.ts, cli/knowledge.ts, cli/worktree.ts, cli/state.ts]
updated: 2026-11-07
---
# Run commands

Part of [[CLI]].

## In plain words
The small commands agents call while they work: starting a run's own branch, handing a run to a second agent, finishing a run, scheduled automations, and the checks before a run lands.

## What it does
- `kaizen prune` also removes launch records (`sessions/<key>.json` with `.pid`/`.run`) older than a week whose run is abandoned, gone, or never existed (`pruneSessions` in `cli/state.ts`). It skips live agents, runs in flight, and done runs, whose records a follow-up resumes. Lists unless `--yes`. Settings → General → Cleanup does each kind separately through `/cleanup` in `cli/web.ts`.

## Where it lives
- `cli/workers.ts` — `kaizen worker init|start|status|config|report|merge|set` (dispatch in `cli/install.ts`): orchestration, off by default. All state is `runs/<id>/workers.json`; `start` only writes a request and waits up to 30 s for the board. Settings (`orchestration.enabled|max_workers|permissions|worker_model.<tool>`) are frozen into the file at `init`. `merge` refuses unless every worker succeeded, and a conflict resets the run's branch to its saved sha and sets the run's blocker. A worker with `after:` branches off the worker it follows; `merge` also refuses a branch that changed paths outside its `owns:` and lists any folder or branch it could not remove. A request older than 60 s is stale: the board ignores it. Never uses `prefersBypass`.
- `cli/automations.ts` — schedules that start a run: rules in `<state>/automations.json`, history in `automation-runs.json`, claims in `automation-claims/`. Five-field cron (no names), minute-walk `nextRun`/`dueSince`. A fire goes through `launchRun` as `auto <request> [automation <name> fire <id>]`: auto mode, every stage, never yolo. Claimed by an atomic `mkdir` per due minute so two boards fire once; skipped with a stored status for precheck, overlap (one open run per rule; a run is open while its stage is not done, while its terminal lives, and a launch whose run never shows the marker stays open for a day), 24/day cap, missed beyond grace (default 720 min), unavailable agent. The run is found later by the `fire <id>` marker in its request. Fires only while a board runs. `shellArgv` picks `cmd /c` or `sh -c` for the precheck (unit-tested; a real Windows run is not).
- `cli/worktree.ts` also backs the board's Git tab: branch against base, pull request (`gh`, GitHub remotes only, one background look per run every 30 s, so a request never waits on GitHub). A failed `git cherry` counts as not landed.

## How it connects
- `cli/knowledge.ts` owns `~/.kaizen/knowledge/<track>.md`; `trackOf()` maps a planner's own track word (`software`, `docs`, `code+writing`) to the stored track before `recall` and `remember`: `remember` (secret check, opt-out via `knowledge.global` in the config chain, append or explicit `--replace`), `recall` (tag + word scoring), and the Claude Code SessionStart hook that install merges into `~/.claude/settings.json` and uninstall removes. It imports nothing from `state.ts` so the hook stays fast. Its flags and line format are the stable interface; the ranking may change.

## Watch out
- `kaizen preflight <id>` (`cli/preflight.ts`) runs before every land: behind the base, this PR's or the base's CI (gh), other open PRs into the base and unmerged branches / in-flight run branches sharing files. Exit 0 clean, 2 stopped. It only reads (fetch, rev-list, diff, cherry, `gh pr view|list`, `gh run list`); no remote, no gh or offline are notes, never a stop, and `git.generated` overlaps are notes. A run with no worktree counts its uncommitted changed files too (`runGit` rows), or a Commit & push on the base would compare nothing. `kaizen worktree land` runs it first and exits 2 on a stop; `--checked` is the user's go-ahead. Each check appends to `runs/<id>/preflight.md`. Not to be confused with `git.land_check`, the test command after a rebase.
- `kaizen model [planner|builder|reviewer]` prints the stage's subagent model (`subagentModel`, `cli/state.ts`), `inherit` when none is pinned; `inherit`/`default`/empty in a project config fall through to the global one. Its tests (`cli/subagent-model.test.ts`) run in a child with a scratch HOME, since `home` is fixed at import.
- `kaizen worktree start [--default] | land <id>`: `--default` (a side run) cuts from the remote default branch and skips `adoptWorkspace`, so it is safe from inside another worktree. Otherwise it must run from the project folder; `locate()` maps a run worktree back to its project, because the worktree holds a partial `.kaizen` (the committed notes) but none of the runs.
- `kaizen done <run id> [--user-approved]`: finishes a run via `finishRun`; exits 1 with an ask-the-user message while the review gate waits (see [[Workflow]]).
- `kaizen handoff start <run>|done|blocked "<reason>"` — hands a worktree run to a second agent; `start` exits 3 for "build here". See [[Workflow]].
- `herdr pane run` types text into the pane's interactive shell, it does not exec: tabs trigger completion and are lost, and quoting is whatever that shell speaks.
- A backlog item's `path:line` is a snapshot from the run that wrote it and rots as the file moves (`cli/install.ts:402` pointed at the `$HOME` guard on 2026-09-07 and at wordmark colour code by 2026-09-30). Re-locate by the symbol the item names before acting on it.
- herdr and macOS Terminal launches type `exec sh <script>` into the tab's shell (`findTerminal` in `cli/state.ts`): the exec is what makes the tab close when the agent ends. Tabs launched before a launcher change keep the old behaviour, so judge a launcher fix on a freshly launched tab. The one-shot script holds the tab open only on exit 126/127 (agent never started).
- A run's tool and model come from `runAgent()` (latest session record, else `state.json` `agent`); `/decide` and `/fix` must keep going through `launchRun(it, dir, id)` with no pick, or a run switches tools mid-flight.
- A test can reach `launchRun` safely only where no terminal is found: on Linux, a child with PATH limited to fake tools and `DISPLAY`/`WAYLAND_DISPLAY`/`TERMINAL`/`TMUX` blanked returns `ok:false` with the manual line. On macOS `findTerminal` always drives Terminal.app, so such a test must be Linux-only.
- Board decisions resume a run's conversation through `SESSION_FLAGS` in `cli/state.ts`. Claude and gemini take an id at launch. Codex, agy and opencode pick their own id, which `find` reads back from the tool's files (codex rollouts, agy `conversations/*.db`, `opencode.db`). agy's `history.jsonl` never records an `agy -i` launch. Any `find` change must keep the window bounded, or one run claims another run's conversation. (2026-10-15-resume-other-agents)
- Agent-invoked CLI commands (remember, card, …) run with cwd anywhere inside the project, often the run dir; resolve the project by walking up to `.kaizen/` (`locate()`), never `cwd/.kaizen` or `basename(cwd)`. (2026-10-27-global-knowledge)
- `runReport()` in `cli/state.ts` dates a run by its report mtimes, capped at `state.json` `updated` once the run is done. Without the cap, any rewrite of a finished run's `03-impl.md` made it claim later runs' uncommitted changes to the files it names (2026-10-30, git-tab run).
- Automations (cli/automations.ts) link a fire to its run by a `fire <id>` marker in 00-request.md; changing how a run's request is written breaks overlap protection.
