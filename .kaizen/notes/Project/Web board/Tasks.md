---
description: The Tasks page, the task forms, inbox stamps and when a task retires
tags: [project, web-board]
sources: [cli/state.ts, web/board]
updated: 2026-11-09
sources: [cli/tasks.ts, cli/task-results.ts, cli/task-service.ts, cli/state.ts, cli/web-tasks.test.ts, cli/tasks.test.ts, cli/task-results.test.ts, web/board]
updated: 2026-11-08
# Tasks

Part of [[Web board]].

## Task page layout (2026-11-11)

Result first: a file strip with thumbnails (`.tp-rail`) beside one large stage, the conversation in a docked right column (`#tp-drawer`, inside `.tp-layout`; on a phone it replaces the result while open, opened by the header chat button; it opens itself only while a decision waits; it starts below the header so Start planning and Accept stay reachable), and one message bar at the bottom. Accept ("Looks good") and the ⋯ details menu (checks, agent, runs, task id) live in the header. Result images sit in `.tp-zoom`, wired by `web/board/zoom.ts`: pinch, ctrl/plain wheel, drag, double-click, and −/100%/+ buttons. It is a `div`, not an `aside`: the board's global `aside` rules hide it.

## In plain words

One task keeps its goal, conversation, decisions and saved results through changes.

## What it does

- Orca Tasks layout (run 2026-10-30-ideas-icebox-orca-tasks, values read from Orca 1.4.244 `TaskPage`): Tasks and Icebox share `.tk-bar` (tinted toolbar) joined to `.tk-list` (bordered list), CSS in `board.html`; since 2026-11-09-icebox-desktop the Icebox's `.tk-bar.ice-bar` is a plain row (no tint or border) and its `.ice-list` is a box of its own. On Tasks, `dock()` in `tasks.ts` moves `#bq`, `#hx` and `#newtop` into the toolbar, leaving a comment node as each one's place; `undock()` on `kz-view` puts them back in the shared header, so Board keeps them. Only `#tk-list` and `#tk-chips` redraw. Open/Running/Done are `.tk-chip`s. Empty states: `.tk-empty`, Icebox's `.ice-zero`.
The shared Tasks surface is now an attention-first list (All, Needs you, In progress,
Completed) and a stable task page at ?view=task&task=<uuid>&dir=<state>. Goals and
optional files are saved before resolving a named project. The page keeps conversation,
versioned decisions, queued receipts, latest/earlier results and acceptance together;
Technical details opens existing run workspaces. Board keeps its columns.
cli/tasks.ts owns schema-1 records in .kaizen/tasks/<uuid>/task.json, cross-process
mutation locks, revision CAS and operation-id replay. Legacy inbox/run rows are adopted
on opening using stamp/index or run id, never title matching. Draft transfer commits
the destination before an alias; original files stay readable. cli/task-service.ts
coordinates launches only after persisting intent, task policy, run identity and
receipts. No busy timeout dispatches work. A structured acknowledgement plus no active
writes enables an ordered batch on the same live terminal; interrupted launches need
explicit recovery. Stop pauses the queue and waits for process termination, without
undoing edits. Finished runs stay finished; later changes create linked internal runs.

Initial production requires confirmation of the current proposal/run/iteration/result
under full/lite and auto, without changing account/tool permissions or global config.
Task acceptance is separate from technical completion and publishing. Current completed
results cannot be accepted with queued work or unresolved decisions.

cli/task-results.ts preserves settled regular outputs atomically with hashes, sizes,
typed artifact ids and checks/limitations. Only project/worktree files pass containment;
symlink escapes/traversal are refused. Text/Markdown is escaped readable text, PDFs,
images and native media have viewers, other formats download. HTML/SVG always download
with sandbox CSP and nosniff. Saved artifacts support byte ranges. Live URLs remain
mutable; no source-tree/database restoration is promised. Copy/disk failures preserve
the previous version. Retention has no automatic expiry and a 2GB publication cap.

- A bare bullet typed into `inbox.md` by hand (`- text`, `* [ ] text`) reads as an open task (`readInbox()`, `cli/state.ts`).

- Each inbox bullet carries a hidden `<!-- added:<ms> -->` stamp (`writeInbox` sets it for new text, keeps it otherwise; stamps are used once per line, so re-adding words an old line holds gets a fresh stamp). `boardCards` retires a task only against runs whose `00-request.md` is not older than that stamp, so an old run with the same words cannot swallow a new task. Unstamped legacy lines match as before.
- A started task also retires when its board launch record (`sessions/<key>.json`, same text) is owned by a run per `ownerOf` — the run's `state.json` `session` matching the launch's id — so a run that reworded the request does not leave the task stuck in planning beside it.
- The Icebox's Add pop-up is gone (2026-11-09-icebox-desktop): its inline capture box (`#ice-cap`, see [[Sources and icebox]]) takes text, pasted pictures, files, dictation and a board; `/icebox` `add` takes `files`, saved to `<state>/attachments/` and linked in the item notes. Done cards (column 4, not the archive) are `compact`: one line, no footer. Empty Planning/Building/Review show a dashed hint (`li.hint`).
## Explore integration (2026-11-08)
The Run form offers Explore first and preserves a user change as a per-run launch override; an untouched default leaves routine-fix routing to intake. See [[Web board/Cards]].
The composer stays mounted through polling; draft text and retry operation ids survive
navigation. Phone Tasks is enabled and Runs links to it. The task projection supplies
shared attention reasons/counts and keeps git housekeeping separate. Home chat remains
its own configured Codex conversation and is not used as a task fallback.
