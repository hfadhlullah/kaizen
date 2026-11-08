---
description: Installer, setup, links, upgrade and uninstall, the Windows launcher
tags: [project, cli]
sources: [cli/setup.ts, cli/look.ts, cli/qr.ts, cli/settings.test.ts]
updated: 2026-11-08
---
# Install and upgrade

Part of [[CLI]].

## In plain words
How kaizen gets onto a computer: installing it for each coding agent, the setup walk-through, upgrading to a new version, and removing it again safely.

## Where it lives
- `cli/install.ts` — everything above; `initProject()` writes a project's `.kaizen/`, its gitignore block and the `## Kaizen workflow` block in `CLAUDE.md` (`writePointer()`).
- No agent found: `noAgent()` shows a picker; an agent with an `install` command in `AGENTS` (Claude Code, Codex, Gemini CLI, OpenCode) is installed after a Yes, `addInstallerBins()` puts `~/.local/bin`, `~/.opencode/bin` and npm's global bin on PATH, `detect()` re-reads it, the agent is offered once for sign-in, and the install continues. Cursor, Antigravity, a failed install or a missing npm fall back to the docs link. `Bun.which` needs `{ PATH: process.env.PATH }` to see a PATH changed at runtime.
- `cli/setup.ts` — `kaizen setup`: numbered steps for project (`projectStep()`), preset, board, and phone, which links Tailscale and rechecks when it is missing (writes `~/.kaizen/web-hosts`, prints a QR from `cli/qr.ts`); install asks only Enter, then offers it. `install.ts` passes it `select`, so it stays testable.
- `cli/look.ts` — banner, `c` and next steps: monochrome, emphasis is bold so it follows the terminal theme. Upgrade output filters on the `+ ` of `step()`; keep that prefix.
- `cli/qr.ts` — dependency-free QR encoder (byte mode, ECC L, versions 1-6), half-block output.
- `cli/install.test.ts`, `cli/settings.test.ts`.

## How it connects
- Links [[Workflow]] files into `~/.claude/skills`, `agents`, `commands`. Skills are linked by folder name, so `skills/media/kaizen-deck` lands as `skills/kaizen-deck`; a renamed skill's old link (`RENAMED_SKILLS`, now incl. `kaizen-motion`, folded into `kaizen-video`) is dropped by uninstall and cleared by install once it dangles and its target folder has that name.

## Watch out
- The "No AI coding agent found" check in `cli/install.ts` guards only the install and the bare dashboard; it sits right above the bare-`kaizen` block. A subcommand dispatched below it would print that and exit 0 having done nothing, on any machine without an agent, CI included; a test spawning `install.ts` passes on a dev machine with `claude` on PATH all the same (G-07 failed on CI from fd58af0 for this). Reproduce CI with `env -i PATH=<bun, git, sh, /usr/bin> HOME=<scratch>`.
- **Never run `kaizen uninstall` against the real install or this checkout** — it deletes `$KAIZEN_HOME`; test in a scratch copy with scratch `HOME` (`.kaizen/memory.md`, header of `cli/install.test.ts`).
- `install.ts` has no exports, so its logic is tested by running it, or by reading a literal from source (the gitignore test).
- Never run `bun cli/install.ts --yes` from this checkout to "fix" `--check`: it repoints the global links (`.kaizen/memory.md`).
- `removeEverything()` lazy-imports from `cli/dashboard.ts`; moving those helpers breaks uninstall (`.kaizen/memory.md`).
- `--init-project` makes the installer set up the folder it runs in without asking; `kaizen setup` uses it with `--yes`.
- `kaizen setup` is dispatched before the no-agent guard: it installs nothing, and CI runners have no agent (2026-10-25-ci-checks-fail).
- The Windows launcher `kaizen.cmd` calls bun by full path (`process.execPath`): cmd.exe on some machines fails to find bun on PATH even when PowerShell can. POSIX keeps bare `bun` because version managers put bun under versioned paths. `kaizen web --shortcut` asks Windows for the Desktop (`GetFolderPath('Desktop')`), since OneDrive moves it (2026-10-27-windows-bun-not-recognized).
- `select()` in `cli/install.ts` has no initial-index parameter: the default answer is whichever option is listed first.
- On this machine the global skill links (`~/.claude/skills/kaizen`) point at `~/kaizen`, a separate clone from the development checkout in `~/Projects/Husein/kaizen`. `bun cli/install.ts --check` from the checkout therefore reports every link missing, and a skill change is live only after `~/kaizen` has it. Never run `bun cli/install.ts --yes` from the checkout to "fix" that: it repoints the global links.
- `cli/install.ts` is a top-level script with no exports; its logic cannot be unit-tested. Exercise it in a scratch folder with `HOME` set to a scratch home and `KAIZEN_HOME` set to a disposable copy of the checkout — never the checkout itself: `kaizen uninstall` recursively deletes `$KAIZEN_HOME`, and on 2026-10-01 that wiped this checkout (.git, .kaizen, every session's uncommitted work).
- `removeEverything()` on win32 walks every drive (`searchRoots` + `findProjects`) and strips kaizen links from each project found; a test that runs `install.ts uninstall` mutates real projects on Windows whatever HOME it sets, so such tests must skip win32.

## Explore integration (2026-11-08)

Settings now offers an optional Explore phase, off by default; see [[CLI/Settings and config]].
