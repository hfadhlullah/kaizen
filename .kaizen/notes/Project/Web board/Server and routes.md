---
description: The board server: routes, host guard, updates, automations and other server-side behaviour
tags: [project, web-board]
sources: [cli/desktop-env.test.ts, cli/automations.ts, web/board/settings-automations.ts, web/board/settings-orchestration.ts, cli/project-tree.test.ts, cli/logo.ts, cli/state.ts, cli/restart.test.ts, cli/hermes.ts, web/board, cli/install.ts, cli/settings.ts, web/term.css, docs/mockups]
updated: 2026-11-07
---
# Server and routes

Part of [[Web board]].

## In plain words
The program behind the board: what it serves, which computers may reach it, how it checks for updates, and the background jobs it runs.

## Where it lives
- Orchestration: `spawnWorkers` in `cli/web.ts` (on the file watcher and the 2 s poll) is the only caller of `startWorker`/`startPty` for workers; a worker is a `shells` entry nested under the run's card, and a running worker with no live terminal and no hand-back is swept to `unverified`. Cards of runs with a `workers.json` carry `workers`; Settings > Orchestration is `web/board/settings-orchestration.ts` above the generic rows.

- `cli/web.ts` — the server: routes such as `/state`, `/run`, `/backlog`, `/decide`, `/fix`, `/commit`, `/pr`, `/events`, `/vault`, `/pty`.

- `cli/web.ts` also serves `/project-tree` and `/project-text` for registered projects. The tree is one level at a time and skips hidden/generated entries and symlinks; text preview is capped at 64 KiB and downloads are plain-text attachments. `cli/project-tree.test.ts` checks path and content boundaries. `web/board/context.ts` draws the right-side Notes, Files and Terminal session list; Notes open in the existing notebook editor.

- `cli/install.ts` dispatches `docs lint` before the default terminal board starts; it adds no web route.

- `cli/state.ts` — everything kaizen knows about a project's `.kaizen/`, shared with the [[Terminal board]]: runs, cards, findings, backlog, git, launching agents.

- `web/board/*.ts` — the page's script, one module per part (`cards.ts` columns, `panel.ts` run panel, `settings.ts`, `icebox.ts`, `projects.ts`, `dictation.ts`, `markdown.ts`, `live.ts`…), wired up by `main.ts` and bundled into `web/board.js` (served at `/board.js`) by `bun run build:web`. State that more than one module writes lives on the one `store` object in `store.ts`; everything else stays in the module that owns it.

- Hosts: the Host guard and `local()` (write Origin check) accept loopback plus the exact names in `KAIZEN_WEB_HOSTS` or `~/.kaizen/web-hosts` (`webHosts()` in `state.ts`, read per request; `kaizen setup` writes the file), for `tailscale serve`; `GET /manifest.webmanifest` makes the board installable on a phone (guide: "From your phone"). `GET /settings` exposes configured `.ts.net` hosts as `phoneUrls`; the gear Settings view shows them under Phone or points to `kaizen setup` when empty. These are saved addresses, not a live Serve status.

- Update alert: `GET /version` (running vs npm `latest`, cached 6 h; the board asks on load and hourly) puts a dot on the Settings menu item, a bottom-right popup (`#updcard`: Update now, or Later, which silences that version in `localStorage` `kz-upd-later`) and an Update bar at the top of Settings; Check for updates appears in both the alert and the quiet row, asks `/version?fresh=1`, and refreshes or clears the alert and dot from the response. A failed check leaves the existing alert in place. `POST /upgrade` runs `install.ts upgrade` in the server, then spawns a new board on the same port, which stops this one through the stale-board path in `web()`; the page reloads on the new boot id. That path waits for the port (up to 8 s, SIGKILL at 5 s) and never walks up while a board it signalled still holds it: the old board spends time in `saveLive`, and a new board on the next port is unreachable through `tailscale serve`, which proxies 7420 only. On Windows the board cannot do that (Windows will not rename `~/kaizen` while the board holds files in it), so it starts a detached `install.ts upgrade --wait <pid> --restart <port>` (output in `~/.kaizen/upgrade.log`) and exits; that process waits for the board to go, upgrades, and starts a board on the port whatever the outcome. The helper runs from a copy of `cli/` in `~/.kaizen/upgrader/`, so nothing runs out of `~/kaizen`; the next board reads `upgrade.log` once at start and, when it failed, `/version` carries `failed` and the Update bar shows "Last update failed: …". In-card agents die with the old board, so before either restart the board writes `~/.kaizen/resume-after-upgrade.json` (`saveLive`: each live in-card session's key and owning run, stamped with the time; it then ends those agents itself); the next board reads it once at start, deletes it, ignores it when older than an hour, works out the owner for sessions whose run did not exist yet, and runs `resumeRun` on each entry — the same code as `POST /resume`: mid-stage runs get the resume prompt in their own conversation, runs waiting on a decision get their conversation back quietly, abandoned runs are skipped. Since 2026-10-29-agents-survive-board-restart the same list covers every stop and crash: the SIGINT/SIGTERM `stop` calls `saveLive()` and waits 400 ms for the agents to end; while running, a 3 s tick (`keepList`) rewrites it with `crash: true` (the hour limit does not apply to a crash list), and an entry resumed after a crash carries `resumed` so a board dying again within 2 min (`CRASH_AGAIN_MS`) leaves it on Resume. Each live card's last 64 KB (`ptyTail`) goes to `~/.kaizen/pty/<key>.log`; `resumeRun` seeds the new pty with the run's newest tail plus `RESUMED` (a dim "board restarted · agent resumed · the step it was on was cut off" line) and deletes it; tails older than a day are swept at start. Auto-resume only happens in card mode (never opens a window). A card pty that ends (and `exitPty`'s hard kill, and `closeOne` on POSIX) signals its whole process group, so `nohup`'d children go too. `agent.keep_alive: tmux` (Linux/macOS with tmux) runs the card agent as `tmux -L kaizen -f /dev/null new-session -A -s kz-<key>` inside the pty (status off, no prefix, escape-time 0), under `systemd-run --user --scope` where a user manager answers (`scopeCmd()`, probed once), so stopping a board run as a systemd unit no longer kills the tmux server with the unit's cgroup (logout still ends it without `loginctl enable-linger`); `mouse on` and `history-limit 10000` (set before `new-session`), right-click menu unbound, since tmux draws on the alternate screen with no scrollback: the wheel and a phone swipe scroll tmux copy-mode, a plain drag selects into tmux's buffer and Shift+drag copies (dropping the alternate screen with `smcup@` lost the lines of a burst, tmux redraws it as one screen). Default stays `off`: resume with the saved screen covers restarts without that copy trade-off: `saveLive` only detaches (`detachPty`), the list entry carries `tmux`, and the next board reattaches with `startPty(key, [], …, {tmux, attach: true})` when `tmuxAlive`, else resumes; `exitPty`/`closeOne` also `killTmux`. Tests: `cli/restart.test.ts`.

- `web/term.css` — terminal styles. `docs/mockups/` — design mockups.

- Automations: a 60 s tick in `cli/web.ts` (own busy flag, `automate`, cleared at shutdown) calls `tickAutomations`; `/automations` (GET, POST ops create|update|pause|resume|delete|run, same-origin + JSON checks, project from `x-kz-dir`, never the home state) feeds Settings → Workflows → Automations (`web/board/settings-automations.ts`; the form draft is kept across redraws). The create form carries a warning that runs are unattended.

- Update: `GET /version` reports `update` when npm has a newer kaizen and `POST /upgrade` runs `kaizen upgrade`; both stand down when `KAIZEN_DESKTOP_BUNDLED=1` (set by the desktop app when it runs its own read-only copy, see `docs/desktop.md`): no Update button, and `/upgrade` answers 409. Inside the desktop app, `web/board/update.ts` uses `window.kaizenDesktop` (the app's preload) instead: Check for updates and Update ask the app's electron-updater for a newer desktop release.

## Watch out
- Desktop bundled board: `KAIZEN_DESKTOP_BUNDLED` and the app's `KAIZEN_HOME` (the read-only bundled copy, equal to `repoDir`) are removed from `process.env` in `web()` *after* `adoptLoginEnv()`. Bun runs the login-shell probe with the board's original environment, so it echoes back what was deleted at load and `adoptLoginEnv` re-adds any key the board lacks: that is how terminals kept `KAIZEN_DESKTOP_BUNDLED=1` and `KAIZEN_HOME=/tmp/.mount_…`, and `kaizen upgrade` in a board terminal failed with `EROFS`. A user's own `KAIZEN_HOME` (not bundled) is kept. Test: `cli/desktop-env.test.ts` (its fake shell answers the probe).

- `web/board.html` is not served verbatim: `notifier()` from `state.ts` is written over a `/*notifier*/` marker (`.kaizen/memory.md`).

- `web/board.js` is committed and hash-checked: after editing `web/board/`, run `bun run build:web` or `cli/notes.test.ts` fails. A module that assigns another module's variable must go through `store`: an imported binding cannot be assigned.

- Project logos: `cli/logo.ts` `projectLogo()` (fixed names only); `/state` projects carry `logo`, `GET /project-logo?dir=` serves it sandboxed; `plogo()` in `web/board/projects.ts` draws it or the folder initial.

- The server keeps no current project: each page sends its pick as `x-kz-dir` (`dirHeader()` in `web/board/api.ts`) and `cli/web.ts` resolves the project per request, so a phone picking another project never moves a desktop tab. `/cd` only checks the folder (and sets up a fresh one).

- `load()` in `web/board.html` runs in every open tab on every server change event, not only on user action. Anything persisted from inside it is overwritten by whichever tab refreshes last; persist from the handler the user triggered.

- `web/board.html` is not served verbatim: `cli/web.ts` writes `notifier()` from `cli/state.ts` over a `/*notifier*/` marker. A function sent this way must stand alone (no imports, no outer constants), and opening the html file directly is a syntax error.

- Since 2026-10-16-board-project-per-page, `kaizen web` keeps no current project: each page sends its pick as `x-kz-dir` (`dirHeader()` in `web/board/api.ts`, `store.dir`), and `cli/web.ts` resolves `state`/`project` per request, falling back to `boardState`. A new board fetch that depends on the project must send that header or pass `dir`, or it reads where the board started.

- The generic `POST` block in `cli/web.ts` (run, fix, decide, commit, pr, icebox…) and `/popup/*` use `strict()`: same host:port Origin plus a JSON content type. Tests that POST must send `content-type: application/json`. `sameOrigin()` no longer accepts any port on a tailnet name. `/file` answers with `content-security-policy: sandbox`; `md()` links pass `safeUrl()` (2026-11-06 security pass).

WhatsApp MP4s over 64 MiB use Hermes' `[[as_document]]` directive, preserving the MP4 bytes and filename; smaller MP4s remain inline videos. `cli/hermes.ts` rejects files over WhatsApp's 2 GB document limit before spawning Hermes. The route's existing output-file and listed-chat checks still apply.

- The Notes project picker shows folder names like the board, full path as the tooltip (`web/notebook.ts`).
