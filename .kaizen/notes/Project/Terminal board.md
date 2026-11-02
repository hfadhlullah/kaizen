---
description: The TUI dashboard that `kaizen` opens in a terminal
tags: [project, tui]
sources: [cli/dashboard.ts]
updated: 2026-10-30
---
# Terminal board

## What it does
What `kaizen` shows once installed: the project's runs as a board in the terminal, plus the few actions you would otherwise open a terminal for (header of `cli/dashboard.ts`). Keys and mouse are described in `docs/guide.md` ("The board", "Mouse").

## Where it lives
- `cli/dashboard.ts` — drawing, keys, mouse.
- State comes from `cli/state.ts` (`boardCards()`, `readRuns()`).
- `cli/dashboard.ts` runs `healRuns` on its project, and a run row's tail shows the final-approval state from `gateOf`: `needs your approval: board, or kaizen done <id> --user-approved`, or `auto-accepted`.

## How it connects
- Same data as the [[Web board]], drawn differently; both import `cli/state.ts`.
- Launches agents for runs through `launchRun()` in `cli/state.ts`.

## Watch out
- Selection is by row index into a column; reordering cards shifts the cursor, and `boardCards()` order is pinned by a test (`.kaizen/memory.md`).
- A mouse click is press + release; a screen opened on press must swallow the release (`.kaizen/memory.md`).
- Driving the `r` path in a test opens a real agent terminal; stop at the mode prompt (`.kaizen/memory.md`).

## Notes
<!-- yours: /kaizen docs never rewrites this section -->
