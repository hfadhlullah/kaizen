---
description: What a kaizen run is, which files define it, and where its state lives
tags: [project, workflow]
sources: [skills/kaizen, agents, commands, cli/worktree.ts, docs/guide.md]
updated: 2026-10-24
---
# Workflow

## What it does
The product itself: a staged workflow (plan, approval, build, independent review, bounded fix loop) that an agent follows from markdown instructions. Nothing here is code; the agent reads it and does the stages. How a run goes for a user is in `docs/guide.md` ("How a run goes"); the full behaviour is in `skills/kaizen/SKILL.md`.

## Where it lives
- `skills/kaizen/SKILL.md` — entry point: commands, modes, runner, state layout.
- `skills/kaizen/spec.md` + `spec-plan.md` / `spec-build.md` / `spec-review.md` / `spec-main.md` — the stage contracts; each reader takes core plus its own stage.
- `skills/kaizen/gather.md`, `discover.md`, `docs.md`, `status.md`, `settings.md`, `install.md` — one file per sub-command.
- `skills/kaizen/config.default.yml` — every setting and its default. Only keys something reads belong there; the review checks, track and backlog paths are fixed in the spec files, not settings.
- `cli/worktree.ts` — each run builds on branch `kaizen/<id>` in `.kaizen/wt/<id>` (`git.worktree_per_run`); `kaizen worktree start|land <id>` makes and lands it, and `state.json` records `worktree` and `branch`. Run notes stay in the project's `.kaizen/runs/`.
- `skills/kaizen/adapters.md` — running it under Codex or Antigravity.
- `agents/kaizen-*.md` — the planner, builder and reviewer subagents.
- `commands/kaizen-*.md` — Claude Code slash commands, each a one-line hand-off to the skill.
- `skills/kaizen-help/` — the help card; `skills/story-deck/`, `skills/story-video/` — separate skills shipped in the same package.

## How it connects
- A request for a whole app (more than one module) is planned as a roadmap (`spec-plan.md`, *A whole application is a roadmap*): `## Discovery` (up to three question rounds), `## Foundation` (frontend, backend and their contract, database and data model, auth, hosting and deploy as chosen in discovery (CI/CD, Docker, managed platform, mobile store builds), layout, and the look and feel asked in discovery) and a numbered `## Roadmap` of end-to-end feature increments, ending with a go-live increment for an app real people use. The run builds increment 1, the skeleton; at approval the main thread files increments 2..N with `kaizen card add --parent` (`spec-main.md`, *Child cards*), and the parent card lists them as children. An increment run reads its parent's Discovery and Foundation as binding.
- A child card is filed as `kaizen card add "<short title>" --notes "<details>"`: the title stays a few words, the details land in the idea's notes under `Parent:` (`addCard` in `cli/state.ts`).
- Any run whose request names an existing thing without its source (app, APK, binary, file format, device, protocol) offers REA once (`spec-plan.md`, *Offer REA*); when REA is not connected it offers to install it (`rea-agents doctor`, a `setup --dry-run` shown to the user, `setup --yes` only on approval, then a restart and resume), give the command, or skip; the main thread asks discovery rounds and that question (`spec-main.md`, *Discovery rounds*).
- Runs are written to `.kaizen/runs/<id>/`; [[Web board]] and [[Terminal board]] read them through `cli/state.ts`.
- [[CLI]] installs these folders as links into `~/.claude/`.
- `/kaizen docs` writes this vault. During a run the builder updates the notes whose `sources` it changed, and the *Docs gate* in `spec-main.md` makes the main thread finish the job before the final report and before `stage: "done"`, in every runner and mode: fix-iteration changes, and changed files no note covers (added to a note's `sources`, or a new note).

## Watch out
- `skills/kaizen/` is the source; `.kaizen/spec*.md` in a project are copies (`kaizen --check` reports drift). In this repo the copies are not committed (`.gitignore`).
- Roadmap mode is for more than one module; a single screen or feature stays one run, and outside roadmap mode the foundation questions stay one round.
- `stage` must be one of `plan`, `build`, `review`, `done`, `abandoned` — `columnOf()` in `cli/state.ts`; any other word shows as planning (`.kaizen/memory.md`).
- Global skill links on this machine point at `~/kaizen`, a separate clone: a skill change is live elsewhere only once `~/kaizen` has it (`.kaizen/memory.md`).

## Notes
<!-- yours: /kaizen docs never rewrites this section -->
