---
description: The Tasks page, the task forms, inbox stamps and when a task retires
tags: [project, web-board]
sources: [cli/state.ts, web/board]
updated: 2026-11-08
---
# Tasks

Part of [[Web board]].

## In plain words
The Tasks page and the task forms: writing a task, attaching files, sending a planned run back to a task, and when a task counts as started.

## Where it lives
- Tasks column tabs (`ideasTab` in `web/board/cards.ts`, kept as `kz-ideas-tab`): the column's title is two icon tabs with counts, **Tasks** (default, `s-idea`) or **Backlog** (`i-clock`), never mixed; the selected tab also shows its word. An empty Tasks list shows the hint "Add a task to start a run" (`HINT[0]`). Backlog lists `backlogCards()` (`cli/state.ts`, sent as `/state` `backlog`, outside `boardCards()` so its pinned order and the terminal board are untouched): the open lines of every non-abandoned run's `06-backlog.md` plus the orphanage `backlog.md`, most severe first; a filter icon in the header (Backlog only) opens a severity menu (High+ · Medium · Low · No severity, from `parseItem`, which reads `<where>: <sev>: …` with ranges/backticks in the place, `1. <sev> — …`, and a bracketed tag such as `Finding 1 (medium)`, `(review 2, low)` or `[low]`, never a severity loose in prose; `store.sevMenu`, closed by the outside-click handlers in `main.ts`/`keys.ts`). A card is (state, source run or `orphan`, n), n numbered as `backlogLines()` numbers them, the same numbering notebook `#backlog-N` links use. Clicking opens the source run's Backlog tab with the item marked (`openAt` in `panel.ts`). Run posts `/run` with `backlog: {source, n}`: the server reads the line itself and launches with notes `Parent: <source>`, `Backlog: <source>#<n>` (and `Backlog item: <raw line>` when tidy shortened it). `startedBacklog()` finds those lines in run requests: a live child hides the card, an abandoned one gives it back, and `markBacklogDone()` (60 s loop beside `markDone`) rewrites the source line to `done: … | <child id>` once the child is done. Reject posts `/backlog` `{op: "reject", source, n, reason}` and writes `rejected: … | reason` in place (`closeBacklog`, raw bytes so CRLF/BOM survive). Lines are never removed or reordered.

- "Back to idea" on a run card still in Planning (card menu, `web/board/cards.ts`) posts `/to-idea {id}`: `runToIdea()` (`cli/state.ts`) refuses unless `stage` is `plan`, then `abandonRun` + `setArchived`, and writes the task back open with a fresh `added` stamp (the `started` inbox line the request contains, notes kept; else the request's first line minus `/kaizen [mode]`). The fresh stamp is what stops the old run retiring it again; a run whose request is under 2 s old still would (`after()` slack in `boardCards`).

- Orca Tasks layout (run 2026-10-30-ideas-icebox-orca-tasks, values read from Orca 1.4.244 `TaskPage`): Tasks and Icebox share `.tk-bar` (tinted toolbar) joined to `.tk-list` (bordered list), CSS in `board.html`. On Tasks, `dock()` in `tasks.ts` moves `#bq`, `#hx` and `#newtop` into the toolbar, leaving a comment node as each one's place; `undock()` on `kz-view` puts them back in the shared header, so Board keeps them. Only `#tk-list` and `#tk-chips` redraw. Open/Running/Done are `.tk-chip`s. Empty states: `.tk-empty`, Icebox's `.ice-zero`.

- Tasks page (`?view=tasks`, `web/board/tasks.ts`, `#tasksv`, `body.taskv`): the rail's cards and `/sources` as a table. Source of a card = the icebox signal (`icebox` + `dismissed` of `/sources`) whose `run` is the run id or whose `idea` is the card's text/title; a non-URL source (`manual`) or none is "Manual". No ID column, no topic tags, no pagination (the data has no stable short id or tags). Start = the run form in a popup (`runPopup()` in `cards.ts`), Open = `open(c)`; a card the board is not showing goes through the deep link. Task rows carry a trash icon that asks in its row (Delete? Keep / Delete), then `/inbox` `op:delete`. A row click moves the `tr.kb` highlight to that row (`sel`). The header holds title, project and Showing; everything else sits in the `.tk-bar` toolbar. On the Tasks page a task's panel shows its notes only, never its agent terminal (`taskBody()`); `openRun()` drops a `/run` fetch that finishes after another card opened, and `load()` only refreshes a run doc for a run card (a stale doc used to redraw a task as a run with its terminal).

## Watch out
- The New task form (`ideaForm()` in `web/board/cards.ts`) opens in a modal (`newIdea()`, via `modal()`) from the top bar's New task, the empty board's button and the `n` key; the `+` in the Tasks column header opens the same form inline at the top of Tasks (`store.mode = "new"`). It takes files by Attach or paste: the task is added through `/inbox` first, then the files go to `/note` (`for: <task text>`), which saves them under `attachments/` and links them in the task's notes. A failed upload leaves a text-only task. `requestOf()` makes the links absolute when the run starts. Add is a split button: its chevron opens a menu with Start run, which does the same add, then reloads, finds the new task card and opens the run form for it in a popup (`runPopup()`). A successful task launch from any run form (`startRun()`) opens the task's run workspace; `showRunView()` follows the task to its run card once that card holds the task's agent session (`pty.key`/`pty.all`) and swaps the address with `replaceState`. Backlog launches stay on the board. The run panel skips a `/state` redraw while focus is anywhere in `.notes`: the rich editor holds focus, not the hidden textarea, and a redraw dropped it to `<body>`, where typing opened the browser's find-as-you-type bar.

- The Edit task form in `inlineForm()` also takes files by Attach or paste. It saves changed text and notes through `/inbox`, then sends new files to `/note` for the saved title; a file-only edit uses `/note` directly. Pending files survive a board redraw and clear on Cancel or Save. A failed upload says the task was saved but the files were not attached.

- A bare bullet typed into `inbox.md` by hand (`- text`, `* [ ] text`) reads as an open task (`readInbox()`, `cli/state.ts`).

- Each inbox bullet carries a hidden `<!-- added:<ms> -->` stamp (`writeInbox` sets it for new text, keeps it otherwise; stamps are used once per line, so re-adding words an old line holds gets a fresh stamp). `boardCards` retires a task only against runs whose `00-request.md` is not older than that stamp, so an old run with the same words cannot swallow a new task. Unstamped legacy lines match as before.

- A started task also retires when its board launch record (`sessions/<key>.json`, same text) is owned by a run per `ownerOf` — the run's `state.json` `session` matching the launch's id — so a run that reworded the request does not leave the task stuck in planning beside it.

- Icebox "Add" opens a `modal()` form like the new-idea one (text, attach, mic, project combo in All projects); `/icebox` `add` takes `files`, saved to `<state>/attachments/` and linked in the item notes. Done cards (column 4, not the archive) are `compact`: one line, no footer. Empty Planning/Building/Review show a dashed hint (`li.hint`).

## Explore integration (2026-11-08)

The Run form offers Explore first and preserves a user change as a per-run launch override; an untouched default leaves routine-fix routing to intake. See [[Web board/Cards]].
