---
description: kaizen docs lint: its checks and the cost line
tags: [project, cli]
sources: [cli/docs.ts, cli/docs.test.ts]
updated: 2026-11-07
---
# Docs lint

Part of [[CLI]].

## In plain words
The check that keeps this project's notes honest: it reports notes that are behind the code, too long, missing their plain-words part, or pointing at files that are gone.

## What it does
`kaizen docs lint` (`lintDocs` in `cli/docs.ts`) only reads files and runs no project command. Beyond links, front matter, sources, coverage and staleness it flags a note body over 16 KB, a missing or code-heavy `## In plain words`, and a backticked repo path whose file is gone (`PATHLIKE`; only when its first folder exists, Log and Archive skipped). A sub-note `A/B` counts as listed when its hub `A` links it. A bare `[[Name]]` that resolves into a folder is a finding (write `[[A/Name]]`): the board resolves it, a raw-file reader cannot. Found by the 2026-11-07 Zendekia eval (the Index linked `[[Attendance]]` for `Zendekia/Attendance`). After the findings `cli/install.ts` prints a cost line from `docsCost` (tokens ≈ bytes ÷ 4: the Index, and the largest note other than Index and Log).

## Where it lives
- `cli/docs.ts` — read-only Project vault lint; reports broken links, metadata, coverage and staleness with a nonzero exit on findings. `cli/docs.test.ts` exercises small temporary projects.
