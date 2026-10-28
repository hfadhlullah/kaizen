---
description: The Notes tab: an Obsidian-compatible markdown folder under .kaizen/notes/
tags: [project, notebook]
sources: [cli/notes.ts, web/notebook.ts, web/notes-lib.ts, web/notes.html, cli/build-web.ts]
updated: 2026-10-28
---
# Notebook

## What it does
Plain markdown files under `<state>/notes/`, folders allowed, so Obsidian can open the same folder (header of `cli/notes.ts`). Supports `[[wikilinks]]` resolved by last segment like Obsidian, `#tags`, and board links like `[[run:<id>]]` and `[[run:<id>#backlog-3]]`. Deleted notes move to `notes/.trash/`. This vault lives in it under `Project/`.

## Where it lives
- `cli/notes.ts` — list, save (with conflict check), rename, delete, `boardIndex()`, `linksTo()`.
- `web/notes-lib.ts` — text rules (wikilinks, tags, code spans) shared by page and tests.
- `web/notebook.ts` → bundled to `web/notebook.js` by `cli/build-web.ts` (`bun run build:web`); `web/notes.html` is the page.

- The project picker lists folder names, as the board does; the full path is the select's tooltip.
- The shared side menu shows a Board waiting count on Notes too. `notebook.ts` refreshes it from `/state?all=1` at load and on `changed` events.
- The board's right-side Notes tree uses `/vault` to list names and opens a selected note in this existing editor; it does not create a second editor. The shared menu now shows Home, Icebox, Board and Settings.

## How it connects
- Served by the [[Web board]] (`/notebook`, `/vault`); a run's panel shows "Linked from notes".
- `/kaizen docs` writes `Project/` here ([[Workflow]]).

## Watch out
- `?embed=1` (`web/notebook.ts`, `body.embed` in `notes.html`) hides the side menu and header: the board's run workspace shows a note this way as a centre tab. The side menu itself is the board's (`initRail()` from `web/board/workspace.ts`).
- `web/notebook.js` is committed and hash-checked: after editing `notebook.ts` run `bun run build:web`, or `cli/notes.test.ts` fails. The hash covers every bundled source and the devDependencies, so a change to the board or bot modules, or a new dev tool, also rebuilds it.
- Inside `notebook.ts`, `history` is CodeMirror's undo; use `window.history` (`.kaizen/memory.md`).
- Backlog links count lines by position; reordering a `06-backlog.md` repoints them (`.kaizen/memory.md`).
- Every autosave fires `changed`, so every open board refetches `/state` (`.kaizen/memory.md`).
- Frontmatter shows as plain text in the editor.

## Notes
<!-- yours: /kaizen docs never rewrites this section -->
