---
description: The kaizen command: installer, upgrade, uninstall, settings, prune, sources
tags: [project, cli]
sources: [cli/install.ts, cli/settings.ts, cli/worktree.ts, package.json]
updated: 2026-10-17
---
# CLI

## What it does
`kaizen` / `kaizen-agent` (both `cli/install.ts`, see `package.json` `bin`) is one top-level script that installs the workflow as links into the agent's folders, and dispatches subcommands: `web`, `settings`/`config`, `upgrade`, `uninstall`, `prune`, `sources`/`gather`/`icebox`, `browser login`, `issue`. With no subcommand in an installed setup it opens the [[Terminal board]]. Flags and behaviour for users: `docs/guide.md` ("Install", "Under the hood").

## Where it lives
- `cli/install.ts` — everything above; `initProject()` writes a project's `.kaizen/`, its gitignore block and the `## Kaizen workflow` block in `CLAUDE.md` (`writePointer()`).
- `cli/settings.ts` — the full-screen settings browser over `config.yml`.
- `cli/install.test.ts`, `cli/settings.test.ts`.

## How it connects
- Links [[Workflow]] files into `~/.claude/skills`, `agents`, `commands`.
- `web` starts the [[Web board]]; `sources`/`gather`/`icebox` and `browser login` drive [[Sources and icebox]].

## Watch out
- **Never run `kaizen uninstall` against the real install or this checkout** — it deletes `$KAIZEN_HOME`; test in a scratch copy with scratch `HOME` (`.kaizen/memory.md`, header of `cli/install.test.ts`).
- `kaizen worktree start|land <id>` must run from the project folder; `locate()` maps a run worktree back to its project, because the worktree holds a partial `.kaizen` (the committed notes) but none of the runs.
- `install.ts` has no exports, so its logic is tested by running it, or by reading a literal from source (the gitignore test).
- Never run `bun cli/install.ts --yes` from this checkout to "fix" `--check`: it repoints the global links (`.kaizen/memory.md`).
- `settings.ts` reads config keys by indentation; keep a key's nesting depth exact (`.kaizen/memory.md`).
- `removeEverything()` lazy-imports from `cli/dashboard.ts`; moving those helpers breaks uninstall (`.kaizen/memory.md`).

## Notes
<!-- yours: /kaizen docs never rewrites this section -->
