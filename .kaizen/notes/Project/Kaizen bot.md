---
description: Kaizen Bot: a chat front end with division agents over the board
tags: [project, bot]
sources: [bot, docs/bot-computer-discovery.md, docs/bot-computer-pilot-report.md]
updated: 2026-11-03
---
# Kaizen bot

## In plain words
A separate chat app in front of the board. You talk to a chief and to team agents; they turn requests into tasks and runs, and anything that starts or approves work waits for your yes.

## What it does
A separate app (`bot/`, its own `package.json`, private) that puts a chat in front of the board: Chief answers what is waiting, division agents turn their team's asks into tasks and runs. Every action is a card; anything that starts or approves a run waits for your Approve. Full description: `bot/README.md`.

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
- Bun exits the process on an unhandled promise rejection (checked on 1.4.2). In `bot/src/server.ts`, anything started from `setInterval` or with `void` (routine `tick`, `refresh`) must catch, or one throwing turn stops the bot server. Deleting an agent mid-turn makes `store.addMessage` throw a FOREIGN KEY error inside runTurn's own catch.
- Since the 2026-10-02 memory-ui run, Kaizen Bot shows no memory text anywhere in the page (side panel list removed, memline hides the fact); memories are only reachable through `GET /bots/<id>/memories`. Any feature that writes memory the user did not type has no visible audit trail unless it adds one.
- Kaizen Bot agents talk through `ask_teammate` (`bot/src/agent.ts`): a nested `runTurn` with `depth: 1` (no further asks) that takes the server's `busy` set and `emitTo` from `Ctx`, and writes no messages to the teammate's thread (only its cards). A new `runTurn` caller in `bot/src/server.ts` must go through `ctxNow(cfg)`, or teammate asks can interleave with a running turn and the teammate's cards and working status never reach open pages.
- Kaizen Bot renders agent replies as Markdown through `mdTree` (`bot/web/app/markdown.ts`, pure, returns `[tag, props, ...kids]`) drawn by `el()`, never innerHTML. `bot/test/app.test.ts` imports it, and its page-text tests (G-03, G-17, G-19) scan `index.html` plus every `bot/web/app/*.ts`.
- `bot/test/app.test.ts` G-01 forbids any literal `fetch(` in `bot/src/`: network goes through an injected `Fetch` (model.ts, board.ts). New loopback probes follow the same pattern. (2026-10-02-bot-app)
- Bun 1.4 cross-compiling for Windows from Linux accepts only `--windows-hide-console`; `--windows-icon/-title/-version/...` error "only available when compiling on Windows". Kaizen Bot's exe therefore has no embedded icon; the Start menu shortcut carries it. (2026-10-02-bot-app-install)
- Kaizen Bot's `bot/src/desktop.ts` `run()` has a 10 s timeout: never route anything that waits on the user (dialogs) through it. Wine has no real PowerShell, so shortcut/self-delete paths can't be tested there. (2026-10-02-bot-app-install)
- Kaizen Bot adopts any board run that is waiting and unclaimed into a live `start_run` card (`refreshOnce` in `bot/src/server.ts`, body `adopted: true`); `claimedRuns()` is what stops a second card. A new card kind that follows a run must also set `run_id` on a `start_run`, or adoption makes a duplicate. Live-card answers (`op: decide`/`op: fix`) are deduped per wait (`state.json` updated) in `approve()`. (2026-10-05-bot-decisions-in-chat)
- Kaizen Bot's computer pilot bakes `bot/pilot/task.sh`, `probes.sh` and `cdp.py` into the `kz-pilot-sandbox` image: an edit there does nothing until `bot/pilot/setup.sh` rebuilds it. A dev server started with `bun start` keeps its old server code until restarted (use `bun --watch run src/server.ts`); the page HTML is re-read per request, so a new page on an old server looks like a broken feature. (2026-10-09-bot-computer-pilot)
- Computer-pilot sandboxes are named `kz-<card id>-*`, and card ids are per database: `bot/pilot/run-pilot.ts` and a running Kaizen Bot can collide on a name. Check `docker ps --filter label=kaizen.sandbox=1` is empty before a pilot run. (2026-10-09-bot-computer-pilot)

## Notes
<!-- yours: /kaizen docs never rewrites this section -->
