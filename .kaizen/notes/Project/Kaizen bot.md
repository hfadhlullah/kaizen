---
description: Kaizen Bot: a chat front end with division agents over the board
tags: [project, bot]
sources: [bot, docs/bot-computer-discovery.md, docs/bot-computer-pilot-report.md]
updated: 2026-10-15
---
# Kaizen bot

## What it does
A separate app (`bot/`, its own `package.json`, private) that puts a chat in front of the board: Chief answers what is waiting, division agents turn their team's asks into ideas and runs. Every action is a card; anything that starts or approves a run waits for your Approve. Full description: `bot/README.md`.

## Where it lives
- `bot/src/server.ts` — the server (`bun run src/server.ts`).
- `bot/src/board.ts` — every call to the board, each citing the `cli/web.ts` route it uses.
- `bot/src/roles.ts` — divisions as data; `agent.ts`, `model.ts`, `db.ts` (SQLite in `bot/data/`), `computer.ts`, `desktop.ts`.
- `bot/web/index.html` (markup and CSS) with its script in `bot/web/app/*.ts`, bundled into `bot/web/app.js` by `bun run build:web` at the repo root and served at `/app.js`; `bot/scripts/package.ts` (desktop build), `bot/pilot/` (computer-use pilot; see `docs/bot-computer-*.md`).

## How it connects
- Depends on the [[Web board]]'s HTTP routes, which are internal to kaizen: a route change can break `bot/src/board.ts`.

## Watch out
- `bot/.env` and `bot/data/` are gitignored and never leave the machine (`.gitignore`).
- Not part of the npm package (`package.json` `files`).

## Notes
<!-- yours: /kaizen docs never rewrites this section -->
