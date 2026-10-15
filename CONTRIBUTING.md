# Contributing to kaizen

Small tool, small rules.

## Set up

[Development](README.md#development) in the README has the whole thing: clone,
`bun install`, `bun test`, and installing from your checkout so the links point at it.

## Changes

- **Tests must pass.** CI runs `bun test` on Ubuntu and Windows. Touched
  `web/notebook.ts` or `web/notes-lib.ts`? Rebuild with `bun run build:web` — a test
  fails on a stale bundle either way.
- **Non-trivial work, dogfood.** Start a run in this repo — `/kaizen <change>` — and
  let it plan, build and review the change. That is the tool doing its own job, and the
  plan and review land in `.kaizen/` for the PR conversation.
- **Commits:** `type: what`, lowercase, as in the log — `docs:`, `fix:`, `feat:`.

## Pull requests

Open one against `main`. Say what changed and why, and what you ran to verify it —
the same proof a kaizen builder has to show.

## Bugs

`kaizen issue [what happened]` opens the GitHub bug form with your system details
filled in, or use *Report an issue* on the board. Nothing is sent until you press
Submit on GitHub.
