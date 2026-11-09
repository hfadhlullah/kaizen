---
description: `kaizen web`: the browser board — a hub; its topics are the sub-notes below
tags: [project, web-board]
sources: [cli/preflight.ts, cli/rea.test.ts, cli/annotate.test.ts, cli/annotate-proxy.test.ts, cli/web-annotate.test.ts, web/board/annotate-lib.test.ts, desktop/src/preload.ts, desktop/src/updater.ts, web/term-font.test.ts, cli/resources.test.ts, cli/computer.test.ts, cli/workers.ts, cli/accounts.test.ts, web/board/settings-accounts.ts, cli/skills.test.ts, cli/report.test.ts, cli/agent-prefs.test.ts, cli/onboarding.test.ts, cli/phone-setup.test.ts, web/board/search.test.ts, web/board/ws-name.test.ts, cli/web.ts, cli/state.test.ts, cli/video.test.ts, web/board.html, design.md]
updated: 2026-11-09
---
# Web board

## In plain words
The board is kaizen in a browser: you see every project's tasks and runs as cards, start an agent on one, approve its plan, watch it work, and commit the result. It runs on your own computer and can be opened on your phone. This note is split by topic; open the one for the part you are touching.

## What it does
`kaizen web` runs a loopback HTTP server over `cli/state.ts` and serves one HTML page that only ever sees JSON (header of `cli/web.ts`). From it you start runs, approve or revise plans, pick findings to fix, commit, push and open or merge a run's pull request (the Source control tab), and open Notes, the icebox and settings. User-facing tour: `docs/guide.md` ("In a browser"). Look and feel: `design.md`.

## Topics
- [[Web board/Layout and look]] — Side menu, sizes, the shared controls (button, icon button, switch, select), colour, theme, motion and the phone layout of the board
- [[Web board/Home, chat and phone]] — Home and its chat, first-run onboarding, phone setup and the phone Home
- [[Web board/Settings]] — The Settings page: agents, models, skills, REA, desktop control, accounts, voice
- [[Web board/Cards]] — Board cards and columns: order, compact done cards, the action button, search and add sheets
- [[Web board/Tasks]] — The Tasks page, the task forms, inbox stamps and when a task retires
- [[Web board/Run workspace]] — The run workspace: tabs, Browser and Preview, annotator, split panes, restart resume, agent reports
- [[Web board/Workspaces]] — Projects list as workspaces, workspace cards, the workspace centre, terminals following their run
- [[Web board/Terminals]] — In-card agent terminals: the PTY, typing into agents, terminal page, font, theme, resources
- [[Web board/Git and landing]] — Source control tab: commit, push, PRs, which files are a run's, and landing
- [[Web board/Server and routes]] — The board server: routes, host guard, updates, automations and other server-side behaviour
- [[Web board/Video]] — The Video page and its version store

## How it connects
- [[Notebook]] is served from the same server (`/notebook`, `/vault`).
- [[Sources and icebox]] routes: `/sources`, `/icebox`, `/reply`, `/chatgpt`. Snoozed icebox items (`asleep` in `/sources`) are left out of the Icebox list, its count, Swipe and the side-menu number.
- Kaizen Bot calls these routes ([[Kaizen bot]], `bot/src/board.ts`).

## Notes
The Projects rail keeps the last valid run state during a transient `state.json` read failure, and board loads discard out-of-order `/state` responses. This prevents a run from briefly disappearing while its agent updates state or refreshes overlap.
<!-- yours: /kaizen docs never rewrites this section -->
- 2026-10-16 run 2026-10-16-tailscale-phone-board — Web board (KAIZEN_WEB_HOSTS allowlist, web app manifest, safe-area insets)
- 2026-10-17 run 2026-10-17-onboarding-setup — Web board (web-hosts file read per request)
- 2026-10-19 board, settings, icebox and notes tree show shimmer skeletons (`.skel`, `SKEL` in dom.ts) while loading (run 2026-10-19-loading-skeletons)
- 2026-10-19 in-card agent asking mark; Yolo kept on decisions (run 2026-10-19-pty-asking-badge)
- 2026-10-23 board templates written to `innerHTML` use the escape-by-default `html` tag in `web/board/dom.ts`: every `${}` is escaped unless it is `raw()`, `ico()`, `SKEL`, another `html` value, or an array of them; do not wrap values in `esc()` inside it (double escaping), keep attributes double-quoted, and join pieces with `html`, never `+` or `.join("")`, which yield a plain string that the next `html` escapes (run 2026-10-23-html-escape-tag)
- 2026-10-23 `/state` resolves in-card terminal owners once per reply, not per card (`ptyOf` in `cli/web.ts`, session ids indexed once by `runSessions` in `cli/state.ts`): ~1 s off every reload while agents run in cards (run 2026-10-23-snappy-select)
- 2026-10-27 notification on/off + sound, Windows terminal-board toast, empty-Ideas + form no longer wiped by the column hint, new-idea files kept across redraws, big photos shrunk before upload (run 2026-10-27-notify-sound-idea-fixes)
- 2026-10-24 Terminal page "needs you": asking tile pulses amber, tab title counts asking agents, background notification (run 2026-10-24-terminal-needs-you)
- 2026-10-26 Home chat keeps its message and composer nodes while streaming and follows the latest reply until the reader scrolls up.
- 2026-10-26 Home shows the active tool or thinking status from Codex JSON events, remembers the open chat in the tab, puts New chat in the header, and hides the board project picker there. Saving board assets no longer auto-reloads open pages; a server restart still reloads when the user leaves Home.
- 2026-10-26 Home reconciles the reply with the saved chat when a stream ends, clearing a stale thinking badge. After a successful project move, the server starts one continuation turn in the destination project, reusing the same reply so the user need not repeat the pending request.
- 2026-10-27 Home chat brief lists runs waiting on the user across listed projects and where run files live, so "What's waiting on me?" works without a project.
- 2026-10-27 Chat activity and messages remain server-backed while the browser visits another page; returning to Home reloads them, and a pending first send can recover its newly created chat after a fast refresh.
- 2026-10-27 Home chat can read and write every listed project without switching (`--add-dir`), and asks before development: start a kaizen run (lite/full, agent) via `[[kaizen:run …]]`, or do it in chat.
- 2026-10-27 Home's live activity draws the Kaizen tanuki as the theme-coloured `.mascot` mask (accent colour, not the dark `/logo.png` tile) with a small laptop overlay, floating motion, and staggered blue dots beside the thinking/tool label.
- 2026-10-27 Home accepts up to five attached or pasted files (10 MB each, 20 MB total) with a message. `POST /chat` accepts multipart form data; `cli/chat.ts` saves files under `~/.kaizen/chats/<id>/attachments/`, records their names in the user message, passes image files with Codex `-i`, and lists all file paths in the prompt. Deleting a chat removes its attachments.
- 2026-10-27 Attachment limits raised, since the board only listens on 127.0.0.1: Home takes 20 files, 100 MB each, 300 MB total; card notes and icebox files take 300 MB total; `Bun.serve` sets `maxRequestBodySize` to 512 MB.
- 2026-10-27 Home keeps a rejected upload's message and error visible in the conversation while restoring its file chips for retry; it only reconciles with the saved server chat after the request was accepted.

- Terminal tiles: `−` hides a live tile into the Hidden chips; `×` asks, then `POST /pty/exit` types `/exit` into the agent (`exitPty` in `cli/pty.ts`, SIGTERM after 5s); the tile stays as ended with Resume. The Grid / Side by side / Stacked switch lives in the page header (`#tmodes`) as three icon buttons (`i-lgrid`, `i-lcols`, `i-lrows`). Maximise pins the tile `position:fixed` over the whole window (`.tile.max`, `body.tmax`, z-index 10 so the card panel still opens above it); Ctrl+Shift+M toggles it for the tile being typed in (window capture listener, so the agent never gets the key), and header actions hand focus back to the terminal (`focusTerm`). Alt+1…9 (read by `e.code`, same capture style) focuses the Nth tile in DOM order, moving the maximise or the phone tab to it; header tooltips end with `Alt+N`. Alt+arrows are deliberately left to the shell's word jump. `openTerms` moves a tile only when it is out of order and re-focuses what had focus: re-appending every tile on each `/state` tick blurred the terminal, so typed keys fell to the page and Firefox opened find-as-you-type.
- Run tab fixes (run 2026-10-29-board-run-panel-right, fix 2): `#rside` sits outside the scrolling `#rtabs` in `#rbar`, so no tab slides under it on a phone; The project registry (`~/.kaizen/projects`) is read through `canonPath()`: trailing slash stripped, symlinks resolved (not on Windows), duplicates read as one; the file is never rewritten by a read.
- 2026-10-30 Board speed: `/state` runs on the thread that carries terminal output, about 250 ms a read on a 600-card board, so concurrent reads froze terminals. Replies are cached (`stateCache`: at most 1 s, dropped by `changed()`, any non-GET, or a change in a pty's status or last line) and git marks for 5 s (`gitCache`, dropped by any non-GET). The page runs one quiet load per 500 ms, one per 5 s while hidden (`flushLoad` on return), and skips the redraw when the reply is unchanged, redrawing at least every 30 s so ages and notices stay current.
- Text the board types into an open agent goes through `submitPty()` (`cli/pty.ts`): the text, then Enter 300 ms later. In one write a TUI reads both as a paste and the Enter never submits.

`liveAgent` also finds a run started in a plain Claude tab, which has no session record: `sessionPty` looks up the run's `session` in `~/.claude/sessions/<pid>.json` (Claude Code's internal file, checked against `procStart`) and walks `/proc` parents to a live pty. `/decide`, `/fix` and `resumeRun` all route through it; no match opens a new tab as before. Linux only; a tmux-kept card is not matched. Tested in `cli/web-decide.test.ts`.
- Phone Runs/Home rows: a task not started opens the run form as a bottom sheet (`dialog.kz.sheet`, `runPopup()`), not an empty workspace; other rows open the workspace.
- Tasks and Icebox lists page through `pager()` in `dom.ts`, size saved per browser (`kz-page:<id>`). Icebox keyboard and bulk actions cover the current page only; Swipe covers every filtered request.

- Workspace pane keys live in `initPaneKeys` (`web/board/run-view.ts`): Ctrl+Space focuses the current pane, then one key within 2 seconds moves between panes (arrows, hjkl) or tabs (1-9, n, p); c, r and d open the new-tab, split-right and split-down menus; x closes the pane. They run in the capture phase so xterm never sees them.


## Explore integration (2026-11-08)

Optional Explore is part of Workflow settings and run details; see [[Web board/Settings]] and [[Web board/Cards]].
