---
description: Start here — the map of this project's notes
tags: [project, index]
updated: 2026-11-07
---
# kaizen — index

kaizen is a staged workflow for AI agents (plan, approval, build, independent review, fix loop) plus the boards and notebook around it, published as `kaizen-agent`. Users start at `README.md` and `docs/guide.md`.

## Read first
- Never run `kaizen uninstall` against the real install or this checkout: it deletes `$KAIZEN_HOME`. Scratch copies only. → [[CLI]]
- Other sessions edit this checkout at the same time: no `git stash` / `git checkout` on shared paths. → [[Conventions and gotchas]]
- `skills/kaizen/` is the source of the workflow; `.kaizen/spec*.md` are copies. → [[Workflow]]
- "Task" is the word users see; stored data keeps `idea` (`inbox.md`, `kind: "idea"`, icebox `idea`, bot DB), and `view=ideas` and `/to-idea` stay as aliases. → [[Web board]]
- Run stages are exactly `plan`, `build`, `review`, `done`, `abandoned`. → [[Workflow]]
- Global skill links point at `~/kaizen`, not this checkout. → [[Workflow]]
- Lessons from past runs: `.kaizen/memory.md`.

## Ask
- Which route serves X, and who may call it? → [[Web board/Server and routes]]
- Where is a Settings page or setting drawn and saved? → [[Web board/Settings]]
- How does a card get its column, order or button? → [[Web board/Cards]]
- What happens when the board types into an agent? → [[Web board/Terminals]]
- How do Browser, Preview and the annotator work? → [[Web board/Run workspace]]
- Which files does Commit & push take for a run? → [[Web board/Git and landing]]
- What may a stage read or write, and which `stage` words exist? → [[Workflow]]
- Which `kaizen` subcommand does X? → [[CLI]]; what does docs lint check? → [[CLI/Docs lint]]
- How do I test, rebuild the bundles, or release? → [[Release and testing]]
- Is it safe to stash, uninstall, or edit a shared file? → [[Conventions and gotchas]]

## Areas
- [[Workflow]] — What a kaizen run is, which files define it, and where its state lives
- [[CLI]] — The kaizen command: installer, upgrade, uninstall, settings, prune, sources
- [[Terminal board]] — The TUI dashboard that `kaizen` opens in a terminal
- [[Web board]] — `kaizen web`: the browser board — a hub; open its topic notes (Cards, Run workspace, Settings, Server and routes, …)
- [[Notebook]] — The Notes tab: an Obsidian-compatible markdown folder under .kaizen/notes/
- [[Sources and icebox]] — Request sources, gather, the icebox, kaizen's browser for social posts, and ChatGPT judging them
- [[Kaizen bot]] — Kaizen Bot: a chat front end with division agents over the board
- [[Release and testing]] — How to test, build the web bundles, and publish a release
- [[Conventions and gotchas]] — How work is done in this repo, and the traps that have bitten before

## Keeping this current
- Changing a file listed in a note's `sources`: update that note. `/kaizen docs` refreshes everything that is behind; `/kaizen docs lint` lists what is.
- [[Log]] records every build and update.
