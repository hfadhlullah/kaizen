---
description: The icebox's ChatGPT side: sorting board captures, task drafts on Promote, discover sorting and Explore's findings
tags: [project, sources]
sources: [cli/chatgpt.ts, cli/sources.ts, cli/web.ts, cli/icebox-ai.test.ts, skills/kaizen/discover.md, skills/kaizen-explore/SKILL.md, cli/settings.ts]
updated: 2026-11-09
---
# AI sorting

Part of [[Sources and icebox]].

## In plain words
With ChatGPT connected, what you drop into the icebox on the board gets its kind and a few tags a few seconds later, and Promote opens with a drafted task you edit. Agents sort what is still unsorted, and Explore offers its findings for the icebox.

## What it does
- `cli/chatgpt.ts` `sortItem()` (schema `icebox_sort`: kind enum from `KINDS`, tags; at most 3 kept, cleaned) and `draftTask()` (schema `icebox_task`: title ≤ 200 kept, details ≤ 1500) over `ask()`; the item and `about(state)` go in the user message only, the instructions say they are data. Neither writes.
- `cli/sources.ts` `applySort(state, id, kind, tags)` writes only while `sorted` is still `rules` (re-reads the file): a person's (`me`) or agent's kind is never overwritten.
- `cli/web.ts`: after `/icebox add` without a kind and with ChatGPT connected, `sortLater()` runs the sort after the answer, one at a time per project (a promise chain per dir), then `changed()`; failures are logged and the item stays unsorted. Op `task-draft {ids}` → `{ok,title,details}`, 409 when not connected or the plan fails, 404 for an unknown id.
- `KAIZEN_CHATGPT_URL` points the ChatGPT host at a local stand-in for tests; only `http://127.0.0.1:<port>` or `http://localhost:<port>` is taken, so the plan's token cannot be sent elsewhere.
- Real calls take about 7–8 s (2026-11-09): that is why the sort never runs before the capture answers.
- `sources.model` / `sources.effort` now read "ChatGPT model/effort for the icebox" and are no longer idle unless social posts go through ChatGPT.
- Agents: `discover.md` step 2 sorts `?` items with `kaizen icebox kind/tag` (stored `sorted: agent`); the Explore skill offers its sourced findings as a multi-select before the exit choice and adds only ticked ones with `kaizen icebox add --file … --kind finding`.
