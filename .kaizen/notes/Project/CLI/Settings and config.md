---
description: The terminal settings browser and how config.yml keys are read
tags: [project, cli]
sources: [cli/settings.ts, cli/settings.test.ts, cli/state.ts]
updated: 2026-11-07
---
# Settings and config

Part of [[CLI]].

## In plain words
The settings screen in the terminal and the settings file behind it: how each choice is stored, read back, and shown only when it applies.

## Where it lives
- `cli/settings.ts` — the full-screen settings browser over `config.yml`; the medium preset now fixes all review severities within its two-round limit.

## Watch out
- `settings.ts` reads config keys by indentation; keep a key's nesting depth exact (`.kaizen/memory.md`).
- A `SETTINGS` row with `when: [key, value]` only has an effect while that other key holds that value; `listSettings()` returns the reason as `idle` and both settings screens dim the row but keep it editable. A row must be a key in `config.default.yml` (a test checks).
- `auto_accept` (top-level in `config.default.yml`, column 0 for `lineOf`): settings row shown only in `auto` mode; not part of the presets, so it reads from the defaults (false).
- `cli/settings.ts` `lineOf()` reads config.yml by regex on indentation, so any new key must keep its exact nesting depth; comments at any indent are safe, a re-indented key silently reads as absent.
- `agent.*` keys are read through `configTexts()` in `cli/state.ts` (project then global, first file that sets the key wins). A new `agent.*` key that reads only one file brings back the bug where a silent project `config.yml` hides the global setting. Config regexes must also allow comment lines between `agent:` and the key: the shipped config has them.
- Some config keys have no code reader because only a prompt reads them (`spec*.md`, `agents/*.md`, `SKILL.md`): before calling a key dead, grep the prompts too. Every `SETTINGS` row in `cli/settings.ts` must be a key in `config.default.yml` (test in `cli/settings.test.ts`). (2026-10-23-settings-cleanup)
