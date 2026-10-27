---
description: How work is done in this repo, and the traps that have bitten before
tags: [project, conventions]
sources: [.kaizen/memory.md, design.md]
updated: 2026-10-27
---
# Conventions and gotchas

## What it does
The rules that are not visible in any one file. The full list of lessons is `.kaizen/memory.md`, kept by kaizen's reviewer; area notes link the ones that belong to them. This note groups the ones that apply everywhere.

## Where it lives
- `.kaizen/memory.md` — cross-run lessons (not committed in this repo).
- `design.md` — visual system for every surface; check contrast by calculation, not by its claim (`.kaizen/memory.md`).

## Shared tree
- More than one session works in this checkout at once. Never `git stash` or `git checkout` a path to get a baseline, and never append cleanup commands to a build; take baselines from a `git worktree` (`.kaizen/memory.md`).
- A run now builds in its own worktree (`.kaizen/wt/<id>`, branch `kaizen/<id>`), so the stash and checkout ban only matters for runs without one. Never `git worktree remove` one that holds unlanded work. See [[Workflow]].
- Two runs in one tree can land in one commit; check `git log --stat -1` before believing nothing is committed (`.kaizen/memory.md`).

## Code style
- Comments explain why, at the top of a file and above non-obvious functions; `ponytail:` comments mark deliberate shortcuts with their ceiling (e.g. `cli/notes.ts`).
- Tests are plain `bun:test` files in `cli/*.test.ts` and `bot/test/`; not every module has its own (`cli/dashboard.ts` and `cli/web.ts` do not).
- Optional tools (git) are shelled out to with a catch: `Bun.spawnSync` throws when the binary is missing (`.kaizen/memory.md`).

## How it connects
- Every area note's "Watch out" cites its own lessons: [[CLI]], [[Web board]], [[Notebook]], [[Terminal board]], [[Sources and icebox]].

## Notes
<!-- yours: /kaizen docs never rewrites this section -->
