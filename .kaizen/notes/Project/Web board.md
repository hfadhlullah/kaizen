---
description: `kaizen web`: the browser board, its HTTP routes, and the shared state layer
tags: [project, web-board]
sources: [cli/web.ts, cli/state.ts, cli/pty.ts, web/board.html, web/board, web/term.ts, design.md]
updated: 2026-10-17
---
# Web board

## What it does
`kaizen web` runs a loopback HTTP server over `cli/state.ts` and serves one HTML page that only ever sees JSON (header of `cli/web.ts`). From it you start runs, approve or revise plans, pick findings to fix, commit and push, and open Notes, the icebox and settings. User-facing tour: `docs/guide.md` ("In a browser"). Look and feel: `design.md`.

## Where it lives
- `cli/web.ts` — the server: routes such as `/state`, `/run`, `/decide`, `/fix`, `/commit`, `/events`, `/vault`, `/pty`.
- `cli/state.ts` — everything kaizen knows about a project's `.kaizen/`, shared with the [[Terminal board]]: runs, cards, findings, backlog, git, launching agents.
- `cli/pty.ts` + `web/term.ts` — the in-card terminal (agent runs inside the board). When that agent ends, the footer offers Resume: `/resume` continues an in-flight run with a prompt, and on a waiting or done run reopens its conversation with nothing sent (refused when none is on disk). xterm.js has no touch scrolling, so `web/term.ts` turns a swipe into `scrollLines`, or into SGR wheel reports when the agent tracks the mouse (a full-screen Claude Code does).
- `web/board.html` — the page: markup, CSS, the side-menu script, and the notifier marker.
- `web/board/*.ts` — the page's script, one module per part (`cards.ts` columns, `panel.ts` run panel, `settings.ts`, `icebox.ts`, `projects.ts`, `dictation.ts`, `markdown.ts`, `live.ts`…), wired up by `main.ts` and bundled into `web/board.js` (served at `/board.js`) by `bun run build:web`. State that more than one module writes lives on the one `store` object in `store.ts`; everything else stays in the module that owns it.
- Hosts: the Host guard and `local()` (write Origin check) accept loopback plus the exact names in `KAIZEN_WEB_HOSTS` or `~/.kaizen/web-hosts` (`webHosts()` in `state.ts`, read per request; `kaizen setup` writes the file), for `tailscale serve`; `GET /manifest.webmanifest` makes the board installable on a phone (guide: "From your phone").
- Update alert: `GET /version` (running vs npm `latest`, cached 6 h) puts a dot on the Settings menu item and an Update bar at the top of Settings; with no update known, that bar is a quiet row whose Check for updates asks `/version?fresh=1`, which skips the cache; `POST /upgrade` runs `install.ts upgrade` in the server, then spawns a new board on the same port, which stops this one through the stale-board path in `web()`; the page reloads on the new boot id.

## How it connects
- [[Notebook]] is served from the same server (`/notebook`, `/vault`).
- [[Sources and icebox]] routes: `/sources`, `/icebox`, `/reply`, `/chatgpt`.
- Kaizen Bot calls these routes ([[Kaizen bot]], `bot/src/board.ts`).

## Watch out
- The New idea form (`web/board/cards.ts`) takes files by Attach or paste: the idea is added through `/inbox` first, then the files go to `/note` (`for: <idea text>`), which saves them under `attachments/` and links them in the idea's notes. A failed upload leaves a text-only idea. `requestOf()` makes the links absolute when the run starts.
- `web/board.html` is not served verbatim: `notifier()` from `state.ts` is written over a `/*notifier*/` marker (`.kaizen/memory.md`).
- Installed as a phone app (`display-mode:standalone`) the body is `position:fixed;inset:0`, because iOS `100dvh` leaves the home-indicator strip black; both pages use `viewport-fit=cover` plus safe-area padding on phones and in standalone at any width; on phones the page background is `--bg` so the inset strips show no dark band.
- `render()` (`web/board/cards.ts`) rebuilds `#board` on every `changed` event; fields need a `draft()` key (`.kaizen/memory.md`).
- `web/board.js` is committed and hash-checked: after editing `web/board/`, run `bun run build:web` or `cli/notes.test.ts` fails. A module that assigns another module's variable must go through `store`: an imported binding cannot be assigned.
- Commit & push stages the whole working tree, and runs commit the paths backticked in `03-impl.md` (`runGit()`; `.kaizen/memory.md`).
- Card fields needing git go in `cardsGit` (`/state`), not `boardCards()` (`.kaizen/memory.md`).
- A global `ul{display:flex}` in `board.html` hits lists in rendered markdown (`.kaizen/memory.md`).
- Settings and the Icebox share one panel and fill it after a fetch: `openSettings()` / `openSources()` must keep the `store.pageGen` check (`go()` bumps it), or a slow answer paints one page under the other's title. Switching to one of them clears the body to a Loading line before the fetch, or the old page shows under the new title until it answers.
- Settings and the Icebox are full width: `aside.docked` header and body pad 28px each side (16px under 900px), no centred column.
- The Icebox is titled in the board header (`markView()` sets the `h1`) and hides the docked panel's header; the project picker shows folder names only, full path in the tooltip. The rail lists Icebox first, in both `board.html` and `notes.html` (a test holds them line for line).
- The server keeps no current project: each page sends its pick as `x-kz-dir` (`dirHeader()` in `web/board/api.ts`) and `cli/web.ts` resolves the project per request, so a phone picking another project never moves a desktop tab. `/cd` only checks the folder (and sets up a fresh one).

## Notes
<!-- yours: /kaizen docs never rewrites this section -->
- 2026-10-16 run 2026-10-16-tailscale-phone-board — Web board (KAIZEN_WEB_HOSTS allowlist, web app manifest, safe-area insets)
- 2026-10-17 run 2026-10-17-onboarding-setup — Web board (web-hosts file read per request)
