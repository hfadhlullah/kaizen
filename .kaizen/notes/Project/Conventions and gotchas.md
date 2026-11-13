---
description: How work is done in this repo, and the traps that have bitten before
tags: [project, conventions]
sources: [.kaizen/memory.md, design.md, .claude/skills, .github, .gitattributes, .gitignore, .prettierrc, AGENTS.md, CLAUDE.md, CONTRIBUTING.md, LICENSE, README.md, docs/README.md]
updated: 2026-11-09
updated: 2026-11-08
# Conventions and gotchas

## In plain words
The house rules that apply everywhere in this project and are not obvious from any one file: how several agents share one folder safely, what never to run, and the traps that have bitten before.

## What it does
The rules that are not visible in any one file. Cross-area lessons are in `.kaizen/memory.md`, kept by kaizen's reviewer; lessons about one area sit in that area's note under *Watch out* (moved there 2026-11-03). This note groups the ones that apply everywhere.

## Where it lives
- `.kaizen/memory.md` — cross-area lessons (not committed in this repo); area lessons are in the area notes.
- `design.md` — visual system for every surface; check contrast by calculation, not by its claim (`.kaizen/memory.md`).

## Shared tree
- More than one session works in this checkout at once. Never `git stash` or `git checkout` a path to get a baseline, and never append cleanup commands to a build; take baselines from a `git worktree` (`.kaizen/memory.md`).
- A run now builds in its own worktree (`.kaizen/wt/<id>`, branch `kaizen/<id>`), so the stash and checkout ban only matters for runs without one. Never `git worktree remove` one that holds unlanded work. See [[Workflow]].
- Two runs in one tree can land in one commit; check `git log --stat -1` before believing nothing is committed (`.kaizen/memory.md`).

## Code style
- Comments explain why, at the top of a file and above non-obvious functions; `ponytail:` comments mark deliberate shortcuts with their ceiling (e.g. `cli/notes.ts`).
- Tests are plain `bun:test` files in `cli/*.test.ts` and `bot/test/`; not every module has its own (`cli/dashboard.ts` and `cli/web.ts` do not).
- Optional tools (git) are shelled out to with a catch: `Bun.spawnSync` throws when the binary is missing (`.kaizen/memory.md`).
- Every `Bun.spawn`/`spawnSync` of a console program from the board passes `windowsHide: true`: a board started from the Windows shortcut has no console, so each child otherwise flashes a new console window (#16, the 60 s `/phone` poll).
- Board pages redraw with `innerHTML`, which drops an open `<details>`/combo and swallows a click whose element is replaced mid-press. Background redraws (server `changed`, `kz-state` polls) go through `whenIdle(root, fn)` in `web/board/dom.ts`, which holds them while a popup is open or the pointer is down (Icebox, Tasks, task page).
- `design.md` now has monochrome as the default palette, with blue as the alternative (`data-color=blue`, `kz-color`). Green, amber and red stay for state.
- Root docs and repo metadata (`README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `CLAUDE.md`, `.github/`, ignore and format files) and the vendored `.claude/skills` are listed here for coverage.

## How it connects
- Every area note's "Watch out" cites its own lessons: [[CLI]], [[Web board]], [[Notebook]], [[Terminal board]], [[Sources and icebox]].
- The desktop app (Electron) has no `window.prompt()`: it returns nothing and shows nothing. Ask for text in a `modal()` dialog (`web/board/dom.ts`), as `askCollection()` in `web/board/icebox.ts` does. `confirm()` and `alert()` do work there. (2026-11-09-icebox-collections)

## Persistent Tasks (2026-11-08)

design.md now explicitly allows the unified Tasks list/shared task page while Board retains workflow columns. Task data keeps durable UUID identity and legacy storage compatibility; do not identify tasks by title or treat saved live links as immutable applications.

## Notes
<!-- yours: /kaizen docs never rewrites this section -->
