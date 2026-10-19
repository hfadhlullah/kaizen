---
description: `kaizen web`: the browser board, its HTTP routes, and the shared state layer
tags: [project, web-board]
sources: [cli/web.ts, cli/logo.ts, cli/state.ts, cli/pty.ts, web/board.html, web/board, web/term.ts, design.md]
updated: 2026-10-19
---
# Web board

## What it does
`kaizen web` runs a loopback HTTP server over `cli/state.ts` and serves one HTML page that only ever sees JSON (header of `cli/web.ts`). From it you start runs, approve or revise plans, pick findings to fix, commit and push, and open Notes, the icebox and settings. User-facing tour: `docs/guide.md` ("In a browser"). Look and feel: `design.md`.

## Where it lives
- `cli/web.ts` — the server: routes such as `/state`, `/run`, `/decide`, `/fix`, `/commit`, `/events`, `/vault`, `/pty`.
- `cli/state.ts` — everything kaizen knows about a project's `.kaizen/`, shared with the [[Terminal board]]: runs, cards, findings, backlog, git, launching agents.
- `cli/pty.ts` + `web/term.ts` — the in-card terminal (agent runs inside the board). When that agent ends, the footer offers Resume: `/resume` continues an in-flight run with a prompt, and on a waiting or done run reopens its conversation with nothing sent (refused when none is on disk). `launchRun` drops inherited Claude Code session variables (`CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_CHILD_SESSION`, …): a board started inside a Claude session would otherwise launch child agents that save no transcript, leaving nothing to resume (#14). While the agent sits on a question (`asking()` in `cli/pty.ts`: Claude Code / Codex prompt text, read after 700 ms of quiet, only output since the last keystroke) `/state` carries `pty.asking` and the card shows an amber `i-ask` mark. A decision on a run started in Yolo keeps Yolo (`launchRun`). xterm.js has no touch scrolling, so `web/term.ts` turns a swipe into `scrollLines`, or into SGR wheel reports when the agent tracks the mouse (a full-screen Claude Code does). It renders with `@xterm/addon-webgl` (the DOM renderer lagged on constant redraws; context loss falls back to DOM), and resizes are debounced 100 ms since each makes the agent redraw. `/file` serves a card's `attachments/` only; in Preview and notes, `attach()` (`web/board/markdown.ts`) rewrites those links and shows any other relative link as its path, since it would open the board's "not found".
- Child cards: a card whose `parent` (from a `Parent:` / `Follow-up of:` line, `parentOf` in `cli/state.ts`) names a run on the board that is not archived and not done is drawn only as a row inside that run's card (`kidsOf`/`nested` in `web/board/cards.ts`): a collapsed `N children · M done` toggle, an orange dot when a child waits on you, and rows that open the child's own panel; a run row is labelled with its run name (like the card header), wrapped, title in the tooltip. Once the parent is done, archived or gone, children are back in their own columns.
- `web/board.html` — the page: markup, CSS, the side-menu script, and the notifier marker.
- `web/board/*.ts` — the page's script, one module per part (`cards.ts` columns, `panel.ts` run panel, `settings.ts`, `icebox.ts`, `projects.ts`, `dictation.ts`, `markdown.ts`, `live.ts`…), wired up by `main.ts` and bundled into `web/board.js` (served at `/board.js`) by `bun run build:web`. State that more than one module writes lives on the one `store` object in `store.ts`; everything else stays in the module that owns it.
- Hosts: the Host guard and `local()` (write Origin check) accept loopback plus the exact names in `KAIZEN_WEB_HOSTS` or `~/.kaizen/web-hosts` (`webHosts()` in `state.ts`, read per request; `kaizen setup` writes the file), for `tailscale serve`; `GET /manifest.webmanifest` makes the board installable on a phone (guide: "From your phone").
- Update alert: `GET /version` (running vs npm `latest`, cached 6 h) puts a dot on the Settings menu item and an Update bar at the top of Settings; Check for updates appears in both the alert and the quiet row, asks `/version?fresh=1`, and refreshes or clears the alert and dot from the response. A failed check leaves the existing alert in place. `POST /upgrade` runs `install.ts upgrade` in the server, then spawns a new board on the same port, which stops this one through the stale-board path in `web()`; the page reloads on the new boot id.

## How it connects
- [[Notebook]] is served from the same server (`/notebook`, `/vault`).
- [[Sources and icebox]] routes: `/sources`, `/icebox`, `/reply`, `/chatgpt`.
- Kaizen Bot calls these routes ([[Kaizen bot]], `bot/src/board.ts`).

## Watch out
- The New idea form (`web/board/cards.ts`) takes files by Attach or paste: the idea is added through `/inbox` first, then the files go to `/note` (`for: <idea text>`), which saves them under `attachments/` and links them in the idea's notes. A failed upload leaves a text-only idea. `requestOf()` makes the links absolute when the run starts.
- Each inbox bullet carries a hidden `<!-- added:<ms> -->` stamp (`writeInbox` sets it for new text, keeps it otherwise; stamps are used once per line, so re-adding words an old line holds gets a fresh stamp). `boardCards` retires an idea only against runs whose `00-request.md` is not older than that stamp, so an old run with the same words cannot swallow a new idea. Unstamped legacy lines match as before.
- `web/board.html` is not served verbatim: `notifier()` from `state.ts` is written over a `/*notifier*/` marker (`.kaizen/memory.md`).
- Installed as a phone app (`display-mode:standalone`) the body is `position:fixed;inset:0`, because iOS `100dvh` leaves the home-indicator strip black; both pages use `viewport-fit=cover` plus safe-area padding on phones and in standalone at any width; on phones the page background is `--bg` so the inset strips show no dark band.
- `render()` (`web/board/cards.ts`) rebuilds `#board` on every `changed` event; fields need a `draft()` key (`.kaizen/memory.md`).
- A card's one ask is a button on its face (`.act`): a waiting run's `actionOf()` label ("Review plan", "See findings", "Review work") opens it, a resumable stalled run gets Resume (`approvals.ts` `resume`). The card menu's Open item uses the same `actionOf()`; `cli/board.test.ts` lifts that declaration out of the source with the menu.
- Each column sorts waiting runs first, then by its Newest/Oldest order. Done cards (column 4, not the archive) are `compact`: one line, no footer. Empty Planning/Building/Review show a dashed hint (`li.hint`).
- `render()` sets `document.title` to `(n) kaizen` while n runs wait on you.
- The header filter box `#bq` sits outside `#board`, so redraws keep its text; `draft()` keeps it over a reload. `/` focuses it when no panel is open (in an open panel `/` still goes to `#sq`); Escape clears it. It matches title, request text and run id.
- `web/board.js` is committed and hash-checked: after editing `web/board/`, run `bun run build:web` or `cli/notes.test.ts` fails. A module that assigns another module's variable must go through `store`: an imported binding cannot be assigned.
- Commit & push stages the whole working tree, and runs commit the paths backticked in `03-impl.md` (`runGit()`; `.kaizen/memory.md`).
- Card fields needing git go in `cardsGit` (`/state`), not `boardCards()` (`.kaizen/memory.md`).
- A global `ul{display:flex}` in `board.html` hits lists in rendered markdown (`.kaizen/memory.md`).
- Settings and the Icebox share one panel and fill it after a fetch: `openSettings()` / `openSources()` must keep the `store.pageGen` check (`go()` bumps it), or a slow answer paints one page under the other's title. Switching to one of them clears the body to a Loading line before the fetch, or the old page shows under the new title until it answers.
- On phones the footer status strip (`.ftr`) is hidden. `#fbtn`, right of the project selects, opens it as a fixed sheet (`statusSheet()` in `cards.ts`). The button shows an amber dot while a run waits and an accent dot while a filter or the archive is on. Both the button and the sheet are off on desktop and on paged views.
- The "Showing" combo (`#showc`) opens its list from its right edge on phones, so it stays on screen.
- On phones (≤640px) the side menu is a bottom tab bar. It is CSS only, in the shared `/* side menu */` block of `board.html` and `notes.html`. The bar is in the page flow (`order:2`), not fixed, and it owns the bottom safe-area inset, so the body drops its own. The logo and the theme toggle are hidden there; theme is in Settings. Open panels (`aside`, fixed) cover the bar.
- Settings and the Icebox are full width: `aside.docked` header and body pad 28px each side (16px under 900px), no centred column.
- The Icebox is titled in the board header (`markView()` sets the `h1`) and hides the docked panel's header; the project picker shows folder names only, full path in the tooltip. The rail lists Icebox first, in both `board.html` and `notes.html` (a test holds them line for line).
- Popups: `web/board/main.ts` closes every open `.menu-pop` on a capture-phase `pointerdown` outside it, so only the newest one stays (card menus use stopPropagation, so bubble listeners never saw those clicks). New popups should be a `.menu-pop` inside a `.combo` to get this for free.
- Project logos: `cli/logo.ts` `projectLogo()` (fixed names only); `/state` projects carry `logo`, `GET /project-logo?dir=` serves it sandboxed; `plogo()` in `web/board/projects.ts` draws it or the folder initial.
- The server keeps no current project: each page sends its pick as `x-kz-dir` (`dirHeader()` in `web/board/api.ts`) and `cli/web.ts` resolves the project per request, so a phone picking another project never moves a desktop tab. `/cd` only checks the folder (and sets up a fresh one).

## Notes
<!-- yours: /kaizen docs never rewrites this section -->
- 2026-10-16 run 2026-10-16-tailscale-phone-board — Web board (KAIZEN_WEB_HOSTS allowlist, web app manifest, safe-area insets)
- 2026-10-17 run 2026-10-17-onboarding-setup — Web board (web-hosts file read per request)
- 2026-10-19 board, settings, icebox and notes tree show shimmer skeletons (`.skel`, `SKEL` in dom.ts) while loading (run 2026-10-19-loading-skeletons)
- 2026-10-19 in-card agent asking mark; Yolo kept on decisions (run 2026-10-19-pty-asking-badge)
