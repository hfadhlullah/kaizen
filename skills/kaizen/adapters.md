# Adapters — running kaizen outside Claude Code

`spec.md` plus its per-stage files (`spec-plan.md`, `spec-build.md`, `spec-review.md`,
`spec-main.md`) are the workflow. It does not mention any vendor, and it is the single
source of truth. An adapter is a thin file that points a given tool at it and
describes how that tool dispatches stages. Adapters never restate the stage rules;
duplicating them is how the tools drift apart.

The portability comes from `.kaizen/` being plain files in the repository. Any tool
that can read a directory can resume a run another tool started.

## Claude Code

Native. The skill in this directory dispatches each stage through the Agent tool
using the `kaizen-planner`, `kaizen-builder`, and `kaizen-reviewer` agent
definitions, and the main thread owns `state.json`.

## Codex — `AGENTS.md`

Codex reads `AGENTS.md` from the repository root. Append:

```markdown
## Kaizen workflow

Non-trivial work in this repo follows the staged workflow in
`.kaizen/spec.md`: plan, human approval, implement, independent review, bounded
fix loop. Read that file before starting, and read `.kaizen/config.yml` for the
mode and approval settings.

Run state lives in `.kaizen/runs/<id>/`. Always read `state.json` first and
continue from the stage it names. Never advance a run whose `awaiting` field is
non-null without a recorded human decision in `02-approval.md` — another tool or
session may be mid-run.

Codex has no separate subagents, so run the stages sequentially in one session,
but keep them clean: start each stage by reading only that stage's declared inputs
from its stage file, and write its artifact before moving on. When reviewing, judge the
diff on its own terms rather than defending the reasoning you used while writing it.
```

Copy `spec*.md` and `config.yml` into `.kaizen/` so the reference resolves
without this skill installed.

## Antigravity

Antigravity reads `AGENTS.md` as well; use the same block. If a workspace-level rules
file is configured instead, point it at `.kaizen/spec.md` and the stage file being run with the same three
paragraphs.

Where Antigravity can run parallel agents, map planner, builder, and reviewer onto
separate agents exactly as Claude Code does — the independent reviewer context is the
part worth preserving in any port.

## Handing a run between tools

Nothing special is required. Because every stage's input and output are files:

1. Tool A finishes a stage and updates `state.json`.
2. Tool B opens the repo, reads `state.json`, sees `stage: "review"` and
   `awaiting: null`, and runs the reviewer.

The only rule is that whichever tool holds the run updates `state.json` when a stage
completes. A stale `state.json` is the one way this breaks.

## Installing the adapter files

`/kaizen init` writes `.kaizen/` with the `spec*.md` files and `config.yml` into the
project folder, plus the gitignore entry when that folder is a git repository.
`/kaizen install` additionally offers to append the `AGENTS.md` block above.
`.kaizen/spec*.md` and `.kaizen/config.yml` should be committed even though run state
is ignored — the workflow is shared, the run data is not:

```gitignore
.kaizen/*
!.kaizen/spec*.md
!.kaizen/config.yml
```
