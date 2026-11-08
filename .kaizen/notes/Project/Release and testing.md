---
description: How to test, build the web bundles, and publish a release
tags: [project, release]
sources: [site/, desktop/, .github/workflows/desktop.yml, package.json, cli/release.sh, cli/publish-gh.sh, .github/workflows/test.yml, cli/build-web.ts, test/tmp.ts, bunfig.toml, bot/bunfig.toml, cli/release.ts, assets, cli/add-project.test.ts, cli/backlog.test.ts, cli/board.test.ts, cli/browser.test.ts, cli/chat.test.ts, cli/chatgpt.test.ts, cli/docs.test.ts, cli/html.test.ts, cli/install.test.ts, cli/knowledge.test.ts, cli/localsend.test.ts, cli/logo.test.ts, cli/notes.test.ts, cli/onboarding.test.ts, cli/project-tree.test.ts, cli/pty.test.ts, cli/release.test.ts, cli/restart.test.ts, cli/settings.test.ts, cli/setup.test.ts, cli/shell-agent.test.ts, cli/sources.test.ts, cli/state.test.ts, cli/subagent-model.test.ts, cli/usage.test.ts, cli/versions.test.ts, cli/video.test.ts, cli/web-accept.test.ts, cli/web-decide.test.ts, cli/web-pr.test.ts, cli/web-symlink.test.ts, cli/worktree.test.ts, cli/writeback.test.ts]
updated: 2026-11-08
---
# Release and testing

## In plain words
How kaizen is tested and published: the test suite that runs on every change, the one command that releases a new version to npm, and the desktop app builds that follow.

## What it does
Tests are `bun test` (all `*.test.ts`, `cli/` and `bot/`), run in CI on Ubuntu and Windows (`.github/workflows/test.yml`). The package is `kaizen-agent` on npm (version 1.75.1 in this checkout); `bun run release [patch|minor|major] [summary]` (`cli/release.ts`) bumps the version — minor when a `feat` commit landed since the last tag, else patch — commits `Release x.y.z: <summary>`, publishes to npm (tests first), pushes, then GitHub Packages. `bunfig.toml` (and `bot/bunfig.toml`) preloads `test/tmp.ts`: each run points `TMPDIR`/`TMP`/`TEMP` at one `kz-test-*` folder and removes it in a preload `afterAll` (bun test never fires `exit` for a preload); the folder is named `kz-test-<pid>-*` and the next run removes any whose process is gone, so an aborted run leaves nothing for long, and tests that skip cleanup no longer fill tmpfs `/tmp`.

## Where it lives
- `package.json` — `test`, `build:web`, `format` / `format:check` (Prettier over the frontend TypeScript: `web/*.ts`, `web/board/`, `bot/web/app/`), `release`, `prepublishOnly` (tests), `postpublish` (`cli/release.sh`: tag + GitHub release).
- `site/` — the static landing page: plain HTML, CSS and JS with GSAP vendored in `site/vendor/`. No build step, not in the npm package. Live at kaizen.sarahdigital.id on the Cloudflare Worker `kaizen-landing`: `bunx wrangler deploy --name kaizen-landing --assets site --compatibility-date <date>`. The Desktop section (`site/main.js`) reads `api.github.com/repos/hfadhlullah/kaizen/releases/latest` and links each `kaizen-desktop-*` asset directly; it stays hidden, and the nav Download pill points at Install, until that release has desktop files. Screenshots in `site/media/` come from a scratch board; never from a real one, whose phone view lists real device names.
- `desktop/` — the Electron desktop app (own `package.json`, not in the npm package): starts `kaizen web` on a free port with a bundled Bun and kaizen copy (a newer `~/kaizen` wins), stops it on close. `bun run dist` builds this OS's installers; `KAIZEN_DESKTOP_SMOKE=1 <app>` starts the board, prints ready and quits. `.github/workflows/desktop.yml` builds Linux (AppImage, deb, rpm, pacman; x64+arm64), macOS (dmg, zip; unsigned) and Windows (NSIS; SignPath when its vars are set), and attaches them to the `v*` tag's release; electron-updater reads the `latest*.yml` there. An `update-test` job (`desktop/scripts/update-test.ts`) proves 0.0.1 updates itself to 0.0.2 on Linux and Windows. See `docs/desktop.md`.
- `cli/publish-gh.sh` — same tarball as `@hfadhlullah/kaizen-agent` on GitHub Packages.
- `cli/build-web.ts` — bundles `web/notebook.js`, `web/term.js`, `web/board.js` and `bot/web/app.js`, committed; `cli/notes.test.ts` fails when one is older than its sources.
- `cli/release.ts` — the `release` script: bump, commit, publish, push. Its `git push origin HEAD` pushes the current branch, so from a worktree branch push `HEAD:main` yourself.
- `cli/*.test.ts` — tests beside the code. `assets/` — README art and the hero capture.

## How it connects
- Bundles feed the [[Notebook]], the [[Web board]] and its terminal, and [[Kaizen bot]]'s page.

## Watch out
- npm serves a new version only after its automated review finishes — minutes after `bun publish` says success; a re-publish answers 409 (`.kaizen/memory.md`).
- Tests that touch install/uninstall must use scratch `HOME` and `KAIZEN_HOME` ([[CLI]]).
- To exercise the board without real state: copy `.kaizen/` to scratch, `kaizen web --port N --no-open` with a scratch `HOME`; stop it with `fuser -k N/tcp` (`.kaizen/memory.md`).
- `bun publish` prints success about a minute before the npm registry serves the new version: `npm view` and the version URL answer with the old one or 404 meanwhile. Recheck after a minute before calling a publish failed. From 1.11.0 (2026-10-01) npm runs an automated review on a new version (status `Validating` on the package page) and serves nothing until it finishes: `bun publish` reports success and postpublish tags and releases on GitHub, but npm serves the old version for many minutes; nothing to approve, wait; a re-publish answers `409 Cannot publish over previously staged version`.
- To run `cli/install.ts` as if on Windows from Linux, use a wrapper file that does `Object.defineProperty(process, "platform", { value: "win32" })` and then `await import(<install.ts>)`. `bun --preload` with the same line does not take effect for it. Run it with `env -i HOME=<scratch> PATH=<dir with only bun>` so no real git or home is reached.

## Notes
<!-- yours: /kaizen docs never rewrites this section -->

- Release 1.75.0: mobile terminal keyboard/history, phone navigation, per-launch agent bypass and keyboard viewport sizing. Agent choice tests cover the default bypass metadata; the all-tool handoff model test installs scratch command stubs so missing local agents cannot silently exercise a fallback tool.
