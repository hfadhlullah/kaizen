---
description: Start here — the map of this project's notes
tags: [project, index]
updated: 2026-10-15
---
# kaizen — index

kaizen is a staged workflow for AI agents (plan, approval, build, independent review, fix loop) plus the boards and notebook around it, published as `kaizen-agent`. Users start at `README.md` and `docs/guide.md`.

## Read first
- Never run `kaizen uninstall` against the real install or this checkout: it deletes `$KAIZEN_HOME`. Scratch copies only. → [[CLI]]
- Other sessions edit this checkout at the same time: no `git stash` / `git checkout` on shared paths. → [[Conventions and gotchas]]
- `skills/kaizen/` is the source of the workflow; `.kaizen/spec*.md` are copies. → [[Workflow]]
- Run stages are exactly `plan`, `build`, `review`, `done`, `abandoned`. → [[Workflow]]
- Global skill links point at `~/kaizen`, not this checkout. → [[Workflow]]
- Lessons from past runs: `.kaizen/memory.md`.

## Areas
- [[Workflow]] — What a kaizen run is, which files define it, and where its state lives
- [[CLI]] — The kaizen command: installer, upgrade, uninstall, settings, prune, sources
- [[Terminal board]] — The TUI dashboard that `kaizen` opens in a terminal
- [[Web board]] — `kaizen web`: the browser board, its HTTP routes, the shared state layer, and the Video page
- [[Notebook]] — The Notes tab: an Obsidian-compatible markdown folder under .kaizen/notes/
- [[Sources and icebox]] — Request sources, gather, the icebox, kaizen's browser for social posts, and ChatGPT judging them
- [[Kaizen bot]] — Kaizen Bot: a chat front end with division agents over the board
- [[Release and testing]] — How to test, build the web bundles, and publish a release
- [[Conventions and gotchas]] — How work is done in this repo, and the traps that have bitten before

## Keeping this current
- Changing a file listed in a note's `sources`: update that note. `/kaizen docs` refreshes everything that is behind; `/kaizen docs lint` lists what is.
- [[Log]] records every build and update.
