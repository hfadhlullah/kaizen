---
description: The Notes tab: an Obsidian-compatible markdown folder under .kaizen/notes/
tags: [project, notebook]
sources: [cli/notes.ts, web/notebook.ts, web/notes-lib.ts, web/notes.html, cli/build-web.ts]
updated: 2026-10-26
---
# Notebook

## What it does
Plain markdown files under `<state>/notes/`, folders allowed, so Obsidian can open the same folder (header of `cli/notes.ts`). Supports `[[wikilinks]]` resolved by last segment like Obsidian, `#tags`, and board links like `[[run:<id>]]` and `[[run:<id>#backlog-3]]`. Deleted notes move to `notes/.trash/`. This vault lives in it under `Project/`.

## Where it lives
- `cli/notes.ts` — list, save (with conflict check), rename, delete, `boardIndex()`, `linksTo()`.
- `web/notes-lib.ts` — text rules (wikilinks, tags, code spans) shared by page and tests.
- `web/notebook.ts` → bundled to `web/notebook.js` by `cli/build-web.ts` (`bun run build:web`); `web/notes.html` is the page.

- The project picker lists folder names, as the board does; the full path is the select's tooltip.

## How it connects
- Served by the [[Web board]] (`/notebook`, `/vault`); a run's panel shows "Linked from notes".
- `/kaizen docs` writes `Project/` here ([[Workflow]]).

## Watch out
- `web/notebook.js` is committed and hash-checked: after editing `notebook.ts` run `bun run build:web`, or `cli/notes.test.ts` fails. The hash covers every bundled source and the devDependencies, so a change to the board or bot modules, or a new dev tool, also rebuilds it.
- Inside `notebook.ts`, `history` is CodeMirror's undo; use `window.history` (`.kaizen/memory.md`).
- Backlog links count lines by position; reordering a `06-backlog.md` repoints them (`.kaizen/memory.md`).
- Every autosave fires `changed`, so every open board refetches `/state` (`.kaizen/memory.md`).
- Frontmatter shows as plain text in the editor.

## Notes
<!-- yours: /kaizen docs never rewrites this section -->
