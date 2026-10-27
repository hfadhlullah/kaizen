---
description: How to test, build the web bundles, and publish a release
tags: [project, release]
sources: [package.json, cli/release.sh, cli/publish-gh.sh, .github/workflows/test.yml, cli/build-web.ts]
updated: 2026-10-23
---
# Release and testing

## What it does
Tests are `bun test` (all `*.test.ts`, `cli/` and `bot/`), run in CI on Ubuntu and Windows (`.github/workflows/test.yml`). The package is `kaizen-agent` on npm (version 1.53.1 in this checkout); `bun run release [patch|minor|major] [summary]` (`cli/release.ts`) bumps the version — minor when a `feat` commit landed since the last tag, else patch — commits `Release x.y.z: <summary>`, publishes to npm (tests first), pushes, then GitHub Packages.

## Where it lives
- `package.json` — `test`, `build:web`, `format` / `format:check` (Prettier over the frontend TypeScript: `web/*.ts`, `web/board/`, `bot/web/app/`), `release`, `prepublishOnly` (tests), `postpublish` (`cli/release.sh`: tag + GitHub release).
- `cli/publish-gh.sh` — same tarball as `@hfadhlullah/kaizen-agent` on GitHub Packages.
- `cli/build-web.ts` — bundles `web/notebook.js`, `web/term.js`, `web/board.js` and `bot/web/app.js`, committed; `cli/notes.test.ts` fails when one is older than its sources.

## How it connects
- Bundles feed the [[Notebook]], the [[Web board]] and its terminal, and [[Kaizen bot]]'s page.

## Watch out
- npm serves a new version only after its automated review finishes — minutes after `bun publish` says success; a re-publish answers 409 (`.kaizen/memory.md`).
- Tests that touch install/uninstall must use scratch `HOME` and `KAIZEN_HOME` ([[CLI]]).
- To exercise the board without real state: copy `.kaizen/` to scratch, `kaizen web --port N --no-open` with a scratch `HOME`; stop it with `fuser -k N/tcp` (`.kaizen/memory.md`).

## Notes
<!-- yours: /kaizen docs never rewrites this section -->
