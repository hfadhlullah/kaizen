---
description: The kaizen command — a hub; its topics are the sub-notes below
tags: [project, cli]
sources: [cli/look.ts, cli/settings.ts, cli/add-project.ts, cli/localsend.ts, cli/localsend.test.ts, cli/preflight.test.ts, cli/automations.test.ts, cli/computer.ts, cli/workers.test.ts, cli/install.ts, cli/stats.ts, cli/stats.test.ts, cli/state-set.test.ts, cli/install-unknown.test.ts, package.json]
updated: 2026-11-16
---
# CLI

## In plain words
The kaizen command you type in a terminal: it installs kaizen for your coding agents, upgrades or removes it, changes settings, tidies old runs, and starts the boards. Most other commands are small helpers the agents call while they work.

## What it does
`kaizen` / `kaizen-agent` (both `cli/install.ts`, see `package.json` `bin`) is one top-level script that installs the workflow as links into the agent's folders, and dispatches subcommands (a first word not in `COMMANDS` is refused with `unknown command`, never run as an install; `cli/install-unknown.test.ts` fails if a dispatched word is missing from that list): `setup`, `web`, `settings`/`config`, `upgrade`, `uninstall`, `prune`, `sources`/`gather`/`icebox`, `browser login`, `issue`, `computer` (desktop control, only while its skill is on; `cli/computer.ts`), `remember`/`recall` (global knowledge, `cli/knowledge.ts`), `send <file>... [--to <name | address>] | --default <name | address> | --devices` (LocalSend, `cli/localsend.ts` `cli()`: one session for all files so the device asks once; a `--to` that looks like an address, or the saved default in `~/.kaizen/localsend.json`, skips multicast and probes `GET /api/localsend/v2/info` over HTTPS then HTTP, which is how a phone over Tailscale is reached; the project `## Kaizen workflow` block tells agents to use it, and `writePointer()` adds that paragraph to projects set up before it; `send --whatsapp <file>... [--to <chat | self>] [--text ..]` goes through the linked WhatsApp instead, `cli()` in `cli/whatsapp.ts`, and has its own paragraph in that block, added the same way), `stats [<id>] [--json]` and `related <path...>` (read-only, `cli/stats.ts`: counts and medians over every run, a run's tokens from its Claude session log inside the run's time window, earlier runs that changed the given files), `state <id> key=value` (the one writer for a run's `state.json`: `setRunState()` in `cli/state.ts` over `setStage`, refusing unknown `stage`/`awaiting` words and `stage=done`, which stays `kaizen done`; every stage or awaiting change, and `kaizen done`, appends a line to `runs/<id>/stages.log`, the only source of stage times), and `automation list|add|run|pause|resume|rm|runs` (`cli/automations.ts`), and `docs lint` (`cli/docs.ts`). With no subcommand in an installed setup it opens the [[Terminal board]]. Flags and behaviour for users: `docs/guide.md` ("Install", "Under the hood").

## Topics
- [[CLI/Install and upgrade]] — Installer, setup, links, upgrade and uninstall, the Windows launcher
- [[CLI/Settings and config]] — The terminal settings browser and how config.yml keys are read
- [[CLI/Run commands]] — worktree, handoff, done, worker, automations, preflight, model and other agent-called commands
- [[CLI/Docs lint]] — kaizen docs lint: its checks and the cost line

## How it connects
- `web` starts the [[Web board]]; `sources`/`gather`/`icebox` (with `icebox add|edit|kind|tag|board|snooze|unsnooze|boards`, text from `--file` or stdin) and `browser login` drive [[Sources and icebox]].

## Persistent Tasks (2026-11-08)

The task subcommand exposes task show and validated structured task event publication. cli/task-service.ts coordinates the Task protocol; launch prompts supply the absolute current CLI for older installations. Task-linked state changes honor frozen proposal confirmation before build/review/done.

## Notes
<!-- yours: /kaizen docs never rewrites this section -->

## Explore state (2026-11-08)

`kaizen state` accepts `stage=explore`, `awaiting=explore` and validates `explore_status=active|completed|skipped`. `kaizen stats` reports Explore time separately from Plan. The installed core `kaizen-explore` skill is discovered by the existing bundle scanner. `/kaizen explore` and `/kaizen skip-explore` are agent skill commands, not standalone shell subcommands.

## The kaizen note in a project (2026-11-16)
`writePointer(dir, agents, create)` in `cli/add-project.ts` writes the `## Kaizen workflow` section into a project's `CLAUDE.md`, and into `AGENTS.md` when a non-Claude agent is on PATH (`kaizen init`) or the file exists. Its skills paragraph is `OFFER`: when a plain message is what a kaizen skill does and the person did not name it, the agent offers the skill in one line and starts it only on a yes (`kaizen`, `kaizen-explore` for research and "should we X or Y", `kaizen-concept`, `kaizen-video`, `kaizen-deck`, `kaizen-book`, `kaizen-game`, the icebox); never for a question about how something works, an explanation, reading code or a one-line fix. `OFFER` has one copy; Home Chat's brief imports it. Re-running `kaizen init` replaces the old skills line, or an earlier wording of the rule that kaizen shipped (`PREVIOUS`; when `OFFER` changes, add its old text there so it reaches every project), with the current one, adds the paragraph when it is missing, and leaves a paragraph the person edited alone; in a folder already set up it only updates an existing section (`create: false`), never adds one. Only that section is touched: the rest of a user's file is kept byte for byte. The board's add-project paths (existing folder, new, clone, `notePointer` in `cli/web.ts`) call it too, and a folder that cannot be written still adds. Measured 2026-11-16 (`claude -p`, Haiku and Sonnet, run 2026-11-16-offer-skills): with the note 7 of 7 skill messages were offered and none started, a README question and a typo fix were not offered; without it 0 of 6. Before this, the upgrade in `kaizen init` never ran for a folder that already had `.kaizen/`.

## Help and plain settings words (2026-11-16)
`kaizen --help`, `-h` and `help` print the grouped list in `HELP` (`cli/install.ts`: Get started, Runs, Notes and ideas, Tools for you and your agents), one line for every word in `COMMANDS`; `cli/install-unknown.test.ts` fails when a command has no line, and an unknown first word still exits 1 with the same list. Before, `--help` fell through to the installer. The installer's last screen adds "Or open the board: kaizen web" (`nextSteps`, `cli/look.ts`). Settings rows carry `labels` (`PLAIN` in `cli/settings.ts`): the option names the board and the terminal screen show (Ask me, Automatic, Plan only, Review only; Separate agents, One session; Own agent, This session, Fresh agent; Yes, No; Same as main, Same as above; capitalised severities), while `config.yml` keeps the stored words (`approve`, `auto`, `full`, `lite`, `subagent`, `inline`, `ask`, `true`, `false`, `inherit`, `default`); a test fails when a label names a value the row does not have, or a hint reads like the config file (`auto_accept`, `subagent`, `inline`, `lite`, `true`, `false`). Hints name the option as shown, and an idle row says "No effect unless Agents per run is One session" (`optionLabel`).
