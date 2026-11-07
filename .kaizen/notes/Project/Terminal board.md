---
description: The TUI dashboard that `kaizen` opens in a terminal
tags: [project, tui]
sources: [cli/dashboard.ts]
updated: 2026-11-03
---
# Terminal board

## In plain words
The board you see when you type kaizen in a terminal: your project's runs in columns, with keys and the mouse for the few actions you would otherwise do by hand.

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
- `cli/dashboard.ts` and `cli/settings.ts` both resolve state by walking up from cwd and taking the nearest `.kaizen/`; anything that can create a second `.kaizen/` below an existing one silently shadows the user's runs.
- The dashboard's home panel and the board both draw coloured `●` dots. When checking dot colour in captured output, scope to the frame you mean — a naive grep reads the home panel and reports the wrong state.
- Driving the board's `r` path to completion in a test spawns a real terminal running the configured agent. Stop the test at the mode prompt, or point `agent.default` at something inert first; two live Claude sessions were opened and killed during the mouse run.
- `cli/install.ts` lazy-imports helpers from `./dashboard.ts` inside `removeEverything()`; anything moved out of `dashboard.ts` must be re-pointed there too, or `kaizen uninstall` crashes while `--check` still passes.

## Notes
<!-- yours: /kaizen docs never rewrites this section -->
