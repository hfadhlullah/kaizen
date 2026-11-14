---
description: The Notes tab: an Obsidian-compatible markdown folder under .kaizen/notes/
tags: [project, notebook]
sources: [cli/notes.ts, web/notebook/notebook.ts, web/notebook/notes-lib.ts, web/lib/notebook/kit.ts, web/lib/notebook/kit-loader.ts, web/pages/notebook-page.tsx, web/components/notebook, web/lib/notebook, web/html/notes.html, cli/build-web.ts]
updated: 2026-11-14
---
# Notebook

## In plain words
The Notes tab: a folder of plain notes you can also open in Obsidian. Notes can link to each other and to runs on the board, and this project's own documentation lives here too.

## What it does
Plain markdown files under `<state>/notes/`, folders allowed, so Obsidian can open the same folder (header of `cli/notes.ts`). Supports `[[wikilinks]]` resolved by last segment like Obsidian, `#tags`, and board links like `[[run:<id>]]` and `[[run:<id>#backlog-3]]`. Deleted notes move to `notes/.trash/`. This vault lives in it under `Project/`.

## Where it lives
- `cli/notes.ts` — list, save (with conflict check), rename, delete, `boardIndex()`, `linksTo()`.
- `web/lib/notebook/text.ts` — text rules (wikilinks, tags, code spans, tree, names) shared by the page, `cli/` and tests; `web/notebook/notes-lib.ts` re-exports it for `cli/`.
- `web/lib/notebook/` — the page's logic, no JSX: `vault-store.ts` (zustand state), `vault-actions.ts` (open, create, rename, delete, load, flush), `vault-session.ts` (start, live refresh, leave guards), `vault-rules.ts` (search, tag counts, backlinks, rename target, age), `autosave.ts` (the 600 ms save as a state machine), `deal.ts` (the page-turn animation), `engine*.ts` (CodeMirror 6: widgets, live preview, `/` and `[[` menus, `createEditor`). Tests beside them.
- `web/components/notebook/` — header (project Picker, New note), sidebar (search, tags, tree), the paper (name box, meta bar, backlinks, blank states) and `EditorPane`; `web/pages/notebook-page.tsx` composes them.
- `web/notebook/notebook.ts` (a short entry) → bundled with React and CodeMirror to `web/dist/notebook.js` by `cli/build-web.ts` (`bun run build:web`); it renders `web/pages/notebook/App.tsx` (the shared `Rail`, `Sprite`, the Notes page and the kit's popups) into `<div id="root">`. `web/html/notes.html` is a 12-line shell linking `/notebook.css` (the kit and `web/ui/legacy/notes.css`).

- The project picker lists folder names, as the board does; the full path is what the picker's search matches. It lists every known project (`known` from `/state`), not only the board picker's: a project outside the Projects folder shows too.
- `?dir=` wins: `pickProject()` in `web/notebook/notes-lib.ts` opens the project the address names even when the picker (`/state` projects, filtered by the Projects folder) leaves it out, and adds it to the select; `/vault` checks it. Before, a run's note tab for a project outside the Projects folder opened another project and showed nothing (issue #86, common on Windows).
- The shared side menu shows a Board waiting count on Notes too. `notebook.ts` refreshes it from `/state?all=1` at load and on `changed` events (`startVault({ onChanged })`).
- The board's right-side Notes tree uses `/vault` to list names and opens a selected note in this existing editor; it does not create a second editor. The shared menu now shows Chat (Home on a phone; 2026-11-13), Icebox, Board and Settings.
- The palette (`kz-theme`, `kz-color`, motion) is applied by `bootShell()` (`web/lib/shell/appearance.ts`) at the start of the bundle, as on the board; the script is no longer inline, so a stored theme that differs from the system's can show the default for the moment the bundle loads.

## How it connects
- Served by the [[Web board]] (`/notebook`, `/vault`); a run's panel shows "Linked from notes".
- `/kaizen docs` writes `Project/` here ([[Workflow]]).

## Watch out
- `?embed=1` (`web/notebook/notebook.ts`, `body.embed`) hides the side menu and header: the board's run workspace shows a note this way as a centre tab. It mounts only the toasts and questions (no palette, no Projects list, no `initRail()`), so it needs no kit round trip. The side menu itself is the board's: `initRail()` from `web/lib/rail/rail-boot.ts` feeds the cards to the React Projects list that the `Rail` draws into `#plist` (`components/rail`, state in `lib/rail`), and its filter into `#pfilter-host`.
- The Projects list, its filter, Search (Ctrl+K), Projects +, New workspace and the worktree right-click menu are the kit's, mounted by `notebook.ts` at start (`kit.ts`); shared code reaches their stores through `window.kzKit` (`kit-loader.ts`), because Video must not carry React. Details: [[Conventions and gotchas]].
- Saving: an edit waits 600 ms, then writes; switching notes, Ctrl+K, a hidden tab, closing and the browser's `pagehide` all write first (a keepalive request on the last), and `beforeunload` asks while text is unsaved. The file changing on disk while the note is open (the board's `changed` event) is taken only when nothing typed here is unsaved; otherwise the save meets a 409 and the bar offers Keep mine / Load theirs.
- The editor (`EditorPane`) is made once per note opening and kept through renames and refreshes; do not give it a key that changes on rename or redraw, or the cursor and undo history are lost (the `doc` counter in the store is the key).
- Delete asks through the kit's dialog (`ask()`), then moves the note to `notes/.trash`. The `/` menu is CodeMirror's own tooltip, not a kit popup.
- `web/dist/notebook.js` is committed and hash-checked: after editing any notebook source run `bun run build:web`, or `cli/notes.test.ts` fails. The hash covers every bundled source and the devDependencies, so a change to the board or bot modules, or a new dev tool, also rebuilds it.
- A card's "Notes" chat (the box under a run or task in the board's panel) is not part of this page: it is the board bundle's `components/notes` over `lib/notes`, and dictation (`lib/dictation`, `MicButton`) is the board bundle's too. Nothing `notebook.ts`, `video.ts` or the kit imports reaches them (`web/checks/structure.test.ts`), so the Notebook has no dictation. The page's own folders are `components/notebook` and `lib/notebook` (not `notes`): keep the two apart.
- Where CodeMirror's `history` (undo) is imported, the browser's is `window.history` (`.kaizen/memory.md`); `vault-actions.ts` uses `window.history.replaceState`.
- Backlog links count lines by position; reordering a `06-backlog.md` repoints them (`.kaizen/memory.md`).
- Every autosave fires `changed`, so every open board refetches `/state` (`.kaizen/memory.md`).
- Frontmatter shows as plain text in the editor.
- The notebook saves while you type, and every save under a state dir fires `changed`, so each open board tab refetches `/state` (and `cardsGit` shells out to git) on every autosave. Anything making `/state` heavier multiplies by typing speed.
- Notebook links name backlog items by position (`[[run:<id>#backlog-3]]` is the third `- open|done|rejected:` line of that run's `06-backlog.md`, in `boardIndex()` and the board's `mark()` alike). Anything that reorders, removes or reformats backlog lines silently repoints those links.

## Notes
<!-- yours: /kaizen docs never rewrites this section -->

- Phone navigation shares the board menu order: Runs, Search, Home, Chat, Terminal. Terminal links to the all-project terminal page. See [[Web board/Layout and look]].
