# Kaizen desktop app

The kaizen board in its own window, for Linux, macOS and Windows. It shows the same board as `kaizen web`, run by a native app: it starts the board on a free local port, shows it, and stops it when you close the window. Nothing keeps running after that.

## Install

Download your system's file from the [GitHub release](https://github.com/hfadhlullah/kaizen/releases):

| System | File |
|---|---|
| Windows | `kaizen-desktop-<version>-win-x64.exe` |
| macOS (Apple silicon / Intel) | `kaizen-desktop-<version>-mac-arm64.dmg` / `-mac-x64.dmg` |
| Arch, CachyOS, Manjaro | `kaizen-desktop-<version>-linux-x64.pacman`, then `sudo pacman -U <file>` |
| Debian, Ubuntu | `kaizen-desktop-<version>-linux-amd64.deb` |
| Fedora, openSUSE | `kaizen-desktop-<version>-linux-x86_64.rpm` |
| Any Linux | `kaizen-desktop-<version>-linux-x86_64.AppImage` (`chmod +x`, run) |

There are arm64 builds for Linux too.

The macOS build is not signed yet. The first time, right-click the app and choose **Open**. On macOS the app tells you when a new version is out, and you download it yourself. Windows and Linux (AppImage, deb, rpm, pacman) update on their own when you quit the app.

## Which kaizen it runs

The app carries its own copy of kaizen and of Bun, so it works with nothing else installed. If `~/kaizen` (or `KAIZEN_HOME`) holds a newer kaizen, the app runs that one instead. When the app runs its own copy, the board hides its Update kaizen button: that copy is read-only and updates with the app. It reads the same `~/.kaizen` as the CLI, so the board shows the same projects and runs.

## How it works

- `desktop/src/server.ts` finds a free port, starts `bun cli/install.ts web --port N --no-open --foreground`, waits for it to answer, and stops the process and everything it started when you quit (SIGTERM on Linux and macOS, `taskkill /T` on Windows).
- `desktop/src/main.ts` owns the window. Only one copy runs; opening it again focuses the open window. Links that leave the board open in your browser. If the board stops, the window shows an error page with the log and a **Restart** button. If the page itself crashes, it reloads.
- `desktop/src/updater.ts` checks GitHub Releases at start and every 4 hours.

The design follows Orca (an Electron app that ships the same installer set). The packaged binary turns off Electron's run-as-Node, `NODE_OPTIONS` and inspector switches, which Orca leaves on.

## Build it

```bash
cd desktop
bun install
bun test                 # start, ready, stop, port, version pick
bun run dist             # stage kaizen + Bun, compile, build this OS's installers into release/
KAIZEN_DESKTOP_SMOKE=1 release/linux-unpacked/kaizen-desktop   # starts the board, prints "ready", quits
```

`.github/workflows/desktop.yml` builds on Ubuntu (Linux x64 and arm64), macOS 14 (x64 and arm64) and Windows. It smoke-launches each build, and on a `v*` tag attaches everything to that tag's release. If the release doesn't exist yet, the job creates it as a draft.

The `update-test` job builds 0.0.1 and 0.0.2 against a local feed, starts 0.0.1, and checks that it updates itself to 0.0.2, on Linux (AppImage) and Windows (NSIS). You can run the same test locally with `bun run scripts/update-test.ts` after `bun run stage && bun run compile`. Only a build made by that script, whose `package.json` has `kaizenUpdateTest`, honours its test feed. macOS is left out until the app is signed.

Windows signing goes through SignPath. Set the repository variables `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG` and `SIGNPATH_POLICY_SLUG`, and the secret `SIGNPATH_API_TOKEN`. Until they are set, the signing job is skipped and the unsigned installer ships. Signing changes the installer's bytes, so `scripts/rehash-win.ts` rewrites `latest.yml` to match the signed file.

## Dependencies

All are in `desktop/package.json` only; the kaizen CLI still has none.

- `electron`: the window and the bundled Chromium. The board is only tested in Chromium, so a system webview (Tauri) would behave differently on each OS.
- `electron-builder`: builds every installer format from one config.
- `electron-updater`: updates from the GitHub release feed (`latest*.yml`) that electron-builder writes.
