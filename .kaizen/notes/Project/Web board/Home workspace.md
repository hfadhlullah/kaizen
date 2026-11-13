---
description: The floating Home workspace: agents and shells in ~/.kaizen/home before any project, minimized to a Home row in the sidebar
tags: [project, web-board]
sources: [web/board/home-ws.ts, web/board/workspace.ts, web/board.html, web/board/main.ts, cli/web.ts, cli/usage.test.ts]
updated: 2026-11-13
---
# Home workspace

Part of [[Web board]]. Terminals in general: [[Web board/Terminals]]. Routes: [[Web board/Server and routes]].

## In plain words
A floating panel on the board where you talk to Claude, Codex or a shell without choosing a project first. Minimize it and it waits as a "Home" row at the top of the Projects list, its agents still running; × on that row ends them.

## Where it lives
- A panel over every view of the board page (`web/board/home-ws.ts`, CSS `.hws*` in `web/board.html`) holding agent and shell tabs that run in kaizen's own folder `~/.kaizen/home`, not in a project — so an agent can be asked something before a project is chosen. Modelled on Orca's Floating Workspace.
- Opened by `Ctrl+Alt+A` (read on `window` in capture, so it works while an xterm has focus) or the round button bottom-right (`#hwsbtn`). An empty workspace that opens starts the default agent (`/agents?home=1`); + offers each agent and Shell. One terminal mounted at a time (`termLoad()`), like the run panel.
- State `kz-home-ws` in localStorage: `open | min | closed`. Minimize (or `Ctrl+Alt+A` again) keeps the terminals running and shows a "Home" row (`#hwsrow`, a `.plist.hwsslot` placed just before `#plist`, so `drawList()` redraws never drop it) at the top of Projects with the live count; clicking it restores the same tab. × on the row or the panel asks "End N Home terminals?" when some run, then `/pty/exit`s each; keys being ended are kept out of the tabs (`ending`) during the 5 s `/exit` grace.
- Server: `POST /shell {home: true}` (see [[Web board/Server and routes]]). Home terminals have `run: "home"` and `dir`/`ws` = `~/.kaizen/home`; they come back after a board restart like the + menu's terminals, and show as tiles on the Terminal page.
- On phones (≤640px) the panel opens full screen (no drag, minimize or maximize; the round button and the Home row stay hidden) and only when asked: from the phone New sheet ("Home — no project", first in its list; `kz-home-start` event) or a tapped Home agent (`kz-open-term`). Its × goes back and leaves the agents running; a tab × ends one. A phone never saves `kz-home-ws`, so Home never opens by itself on load (run 2026-11-13-phone-home-terminal). Not on `notes.html`/`video.html`.
- The side menu item for Home chat reads "Chat" on a computer (`.dkl`/`.phl` spans in board, notes and video pages) since Home names this workspace there; the phone bar keeps "Home".
- The panel (by its header) and the button drag anywhere in the window; positions are kept per browser (`kz-home-ws-at`, `kz-home-ws-btn`). A press moving under 4 px stays a click.
- Home terminals listed elsewhere (Search, the phone's Agents, the resource monitor) open here: `kz-open-term` for a dir matching `isHomeDir()` (`web/board/workspace.ts`) is taken by a listener registered at import, ahead of the run view's; `wsHref()` sends a Home dir to `/?view=board&homews=1`, which `initHomeWs()` turns into an open panel. On a phone they open the Terminal page.

## Watch out
- Rewriting the address at import does not work: other modules read `location.search` earlier in the bundle. Route through `wsHref()` instead.
- `Ctrl+Alt+A` ignores AltGr (Windows reports it as Ctrl+Alt).

- Home terminals run in the user's home folder `~` (run 2026-11-13-home-tilde-light-term): `/shell {home:true}` spawns in `home` while the record keeps `dir`/`ws` = `~/.kaizen/home`, which the Home window, `isHomeDir`, the phone and restart resume match on; restart resume also spawns them in `~`, where Claude keeps their conversation for `--resume`. Claude asks once to trust `~` (it holds `~/.claude/settings.json`, so `trustFolder` will not pre-trust it).

- The resource monitor's Storage header has Cleanup beside Rescan: it dispatches `kz-home-start {agent: "claude", prompt: "/disk-cleanup"}`; `/shell` takes an optional `prompt` (≤ 2000 chars, not for sign-ins) passed to the agent as its argument via `promptArgs` (run 2026-11-13-storage-cleanup-button). The skill ships in `skills/optional/disk-cleanup/` (`SKILL.md` plus the `tui.py` box charts), on by default, so every install has it.
