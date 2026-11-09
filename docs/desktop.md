# Kaizen desktop app

The kaizen board in its own window, for Linux, macOS and Windows. It shows the same board as `kaizen web`, run by a native app: it starts the board on a free local port, shows it, and stops it when you close the window. Nothing keeps running after that.

## Install

Download your system's file from the [GitHub release](https://github.com/hfadhlullah/kaizen/releases):

| System | File |
|---|---|
| Windows | `kaizen-desktop-<version>-win-x64.exe` |
| macOS (Apple silicon / Intel) | `kaizen-desktop-<version>-mac-arm64.dmg` / `-mac-x64.dmg` |
| Any Linux (recommended) | `kaizen-desktop-<version>-linux-x86_64.AppImage`: `chmod +x`, run. It adds itself to the app menu and updates itself. |
| Arch, CachyOS, Manjaro | `kaizen-desktop-<version>-linux-x64.pacman`, then `sudo pacman -U <file>`. Update by hand: install the next `.pacman` the same way. |
| Debian, Ubuntu | `kaizen-desktop-<version>-linux-amd64.deb` |
| Fedora, openSUSE | `kaizen-desktop-<version>-linux-x86_64.rpm` |

There are arm64 builds for Linux too.

The macOS build is not signed yet. The first time, right-click the app and choose **Open**. On macOS the app tells you when a new version is out, and you download it yourself. Windows and the Linux AppImage update on their own (on quit, or with Settings → General → Update Kaizen); the deb, rpm and pacman packages update by hand.

## Which kaizen it runs

The app carries its own copy of kaizen and of Bun, so it works with nothing else installed. If `~/kaizen` (or `KAIZEN_HOME`) holds a newer kaizen, the app runs that one instead. When the app runs its own copy, the board hides its Update kaizen button: that copy is read-only and updates with the app. It reads the same `~/.kaizen` as the CLI, so the board shows the same projects and runs.

**After an update.** Your agents read kaizen's skills, subagents and commands from `~/kaizen`
(the copy `npx kaizen-agent` installed). When the app starts on a newer version than that copy,
it runs `kaizen upgrade` on it in the background, once per app version, and says when it is done
(or where the log is: `~/.kaizen/upgrade.log`). It leaves `~/kaizen` alone when there is none
(desktop only), when it is a git checkout, or when it is already as new.

**Looks like an app.** There is no system title bar: you move the window by the board's top bar
(and the side menu's top row), and the window buttons sit in it (on macOS the traffic lights
are inset; on Hyprland, which has no title bars, there are none: close the window with your keybind). Labels and buttons are not text you can select, buttons use the arrow pointer, and
the window does not bounce or pinch-zoom. Text you might copy — tasks, notes, run documents,
terminals, fields — still selects as before. With a mouse, scrollbars stay hidden until the
pointer is over the area that scrolls (in the browser board too).

## How it works

- `desktop/src/server.ts` takes port 7420 (what `kaizen web` and the phone's `tailscale serve` use) when it is free, else any free port, starts `bun cli/install.ts web --port N --no-open --foreground`, waits for it to answer, and stops the process and everything it started when you quit (SIGTERM on Linux and macOS, `taskkill /T` on Windows).
- `desktop/src/main.ts` owns the window. Only one copy runs; opening it again focuses the open window. Links that leave the board open in your browser. If the board stops, the window shows an error page with the log and a **Restart** button. If the page itself crashes, it reloads.
- `desktop/src/updater.ts` checks GitHub Releases at start and every 4 hours. In the app, Settings → General's **Check for updates** asks the same feed, and **Update Kaizen** downloads the newest build and restarts into it (on macOS, unsigned for now, it opens the download page). `desktop/src/preload.ts` gives the board page only those two calls.

The design follows Orca (an Electron app that ships the same installer set). The packaged binary turns off Electron's run-as-Node, `NODE_OPTIONS` and inspector switches, which Orca leaves on.

## Build it

```bash
cd desktop
bun install
bun test                 # start, ready, stop, port, version pick
bun run dist             # stage kaizen + Bun, compile, build this OS's installers into release/
KAIZEN_DESKTOP_SMOKE=1 release/linux-unpacked/kaizen-desktop   # starts the board, prints "ready", quits
```

`.github/workflows/desktop.yml` builds on Ubuntu (Linux x64 and arm64), macOS 14 (x64 and arm64) and Windows. It smoke-launches each build, and on a `v*` tag attaches everything to that tag's release and publishes it. `cli/release.sh` makes that release as a draft, so the app's updater and the site never see a version without its installers: when a build fails, the release stays a draft (users stay on the last good one), and re-running the failed jobs publishes it once they pass. If no release exists after 10 minutes, the job makes a placeholder draft and leaves it for you to write and publish.

The `update-test` job builds 0.0.1 and 0.0.2 against a local feed, starts 0.0.1, and checks that it updates itself to 0.0.2, on Linux (AppImage) and Windows (NSIS). You can run the same test locally with `bun run scripts/update-test.ts` after `bun run stage && bun run compile`. Only a build made by that script, whose `package.json` has `kaizenUpdateTest`, honours its test feed. macOS is left out until the app is signed.

Windows signing goes through SignPath. Set the repository variables `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG` and `SIGNPATH_POLICY_SLUG`, and the secret `SIGNPATH_API_TOKEN`. Until they are set, the signing job is skipped and the unsigned installer ships. Signing changes the installer's bytes, so `scripts/rehash-win.ts` rewrites `latest.yml` to match the signed file.

## Dependencies

All are in `desktop/package.json` only; the kaizen CLI still has none.

- `electron`: the window and the bundled Chromium. The board is only tested in Chromium, so a system webview (Tauri) would behave differently on each OS.
- `electron-builder`: builds every installer format from one config.
- `electron-updater`: updates from the GitHub release feed (`latest*.yml`) that electron-builder writes.
