---
description: The kaizen command — a hub; its topics are the sub-notes below
tags: [project, cli]
sources: [cli/preflight.test.ts, cli/automations.test.ts, cli/computer.ts, cli/workers.test.ts, cli/install.ts, cli/stats.ts, cli/stats.test.ts, cli/state-set.test.ts, cli/install-unknown.test.ts, package.json]
updated: 2026-11-09
---
# CLI

## In plain words
The kaizen command you type in a terminal: it installs kaizen for your coding agents, upgrades or removes it, changes settings, tidies old runs, and starts the boards. Most other commands are small helpers the agents call while they work.

## What it does
`kaizen` / `kaizen-agent` (both `cli/install.ts`, see `package.json` `bin`) is one top-level script that installs the workflow as links into the agent's folders, and dispatches subcommands (a first word not in `COMMANDS` is refused with `unknown command`, never run as an install; `cli/install-unknown.test.ts` fails if a dispatched word is missing from that list): `setup`, `web`, `settings`/`config`, `upgrade`, `uninstall`, `prune`, `sources`/`gather`/`icebox`, `browser login`, `issue`, `computer` (desktop control, only while its skill is on; `cli/computer.ts`), `remember`/`recall` (global knowledge, `cli/knowledge.ts`), `stats [<id>] [--json]` and `related <path...>` (read-only, `cli/stats.ts`: counts and medians over every run, a run's tokens from its Claude session log inside the run's time window, earlier runs that changed the given files), `state <id> key=value` (the one writer for a run's `state.json`: `setRunState()` in `cli/state.ts` over `setStage`, refusing unknown `stage`/`awaiting` words and `stage=done`, which stays `kaizen done`; every stage or awaiting change, and `kaizen done`, appends a line to `runs/<id>/stages.log`, the only source of stage times), and `automation list|add|run|pause|resume|rm|runs` (`cli/automations.ts`), and `docs lint` (`cli/docs.ts`). With no subcommand in an installed setup it opens the [[Terminal board]]. Flags and behaviour for users: `docs/guide.md` ("Install", "Under the hood").

## Topics
- [[CLI/Install and upgrade]] — Installer, setup, links, upgrade and uninstall, the Windows launcher
- [[CLI/Settings and config]] — The terminal settings browser and how config.yml keys are read
- [[CLI/Run commands]] — worktree, handoff, done, worker, automations, preflight, model and other agent-called commands
- [[CLI/Docs lint]] — kaizen docs lint: its checks and the cost line

## How it connects
- `web` starts the [[Web board]]; `sources`/`gather`/`icebox` (with `icebox add|edit|kind|tag|board|snooze|unsnooze|boards`, text from `--file` or stdin) and `browser login` drive [[Sources and icebox]].

## Notes
<!-- yours: /kaizen docs never rewrites this section -->

## Explore state (2026-11-08)

`kaizen state` accepts `stage=explore`, `awaiting=explore` and validates `explore_status=active|completed|skipped`. `kaizen stats` reports Explore time separately from Plan. The installed core `kaizen-explore` skill is discovered by the existing bundle scanner. `/kaizen explore` and `/kaizen skip-explore` are agent skill commands, not standalone shell subcommands.
