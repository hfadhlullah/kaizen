---
description: How work is done in this repo, and the traps that have bitten before
tags: [project, conventions]
sources: [.kaizen/memory.md, design.md, .claude/skills, .github, .gitattributes, .gitignore, .prettierrc, AGENTS.md, CLAUDE.md, CONTRIBUTING.md, LICENSE, README.md, docs/README.md, web/theme.css, web/ui, web/components, web/pages, web/lib, web/structure.test.ts, web/board/react-mount.ts]
updated: 2026-11-14
updated: 2026-11-08
# Conventions and gotchas

## In plain words
The house rules that apply everywhere in this project and are not obvious from any one file: how several agents share one folder safely, what never to run, and the traps that have bitten before.

## What it does
The rules that are not visible in any one file. Cross-area lessons are in `.kaizen/memory.md`, kept by kaizen's reviewer; lessons about one area sit in that area's note under *Watch out* (moved there 2026-11-03). This note groups the ones that apply everywhere.

## Where it lives
- `.kaizen/memory.md` — cross-area lessons (not committed in this repo); area lessons are in the area notes.
- `design.md` — visual system for every surface; check contrast by calculation, not by its claim (`.kaizen/memory.md`).

## Shared tree
- More than one session works in this checkout at once. Never `git stash` or `git checkout` a path to get a baseline, and never append cleanup commands to a build; take baselines from a `git worktree` (`.kaizen/memory.md`).
- A run now builds in its own worktree (`.kaizen/wt/<id>`, branch `kaizen/<id>`), so the stash and checkout ban only matters for runs without one. Never `git worktree remove` one that holds unlanded work. See [[Workflow]].
- Two runs in one tree can land in one commit; check `git log --stat -1` before believing nothing is committed (`.kaizen/memory.md`).

## Code style
- Comments explain why, at the top of a file and above non-obvious functions; `ponytail:` comments mark deliberate shortcuts with their ceiling (e.g. `cli/notes.ts`).
- Tests are plain `bun:test` files in `cli/*.test.ts` and `bot/test/`; not every module has its own (`cli/dashboard.ts` and `cli/web.ts` do not).
- Optional tools (git) are shelled out to with a catch: `Bun.spawnSync` throws when the binary is missing (`.kaizen/memory.md`).
- Every `Bun.spawn`/`spawnSync` of a console program from the board passes `windowsHide: true`: a board started from the Windows shortcut has no console, so each child otherwise flashes a new console window (#16, the 60 s `/phone` poll).
- Board pages redraw with `innerHTML`, which drops an open `<details>`/combo and swallows a click whose element is replaced mid-press. Background redraws (server `changed`, `kz-state` polls) go through `whenIdle(root, fn)` in `web/board/dom.ts`, which holds them while a popup is open or the pointer is down (Icebox, Tasks, task page).
- `design.md` now has monochrome as the default palette, with blue as the alternative (`data-color=blue`, `kz-color`). Green, amber and red stay for state.
- Root docs and repo metadata (`README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `CLAUDE.md`, `.github/`, ignore and format files) and the vendored `.claude/skills` are listed here for coverage.

## How it connects
- Every area note's "Watch out" cites its own lessons: [[CLI]], [[Web board]], [[Notebook]], [[Terminal board]], [[Sources and icebox]].
- The desktop app (Electron) has no `window.prompt()`: it returns nothing and shows nothing. Ask for text in a `modal()` dialog (`web/board/dom.ts`), as `askCollection()` in `web/board/icebox.ts` does. `confirm()` and `alert()` do work there. (2026-11-09-icebox-collections)

## Persistent Tasks (2026-11-08)

design.md now explicitly allows the unified Tasks list/shared task page while Board retains workflow columns. Task data keeps durable UUID identity and legacy storage compatibility; do not identify tasks by title or treat saved live links as immutable applications.

## React front end (2026-11-14, run 2026-11-14-frontend-rewrite-phase1)

New UI is React 19 + shadcn/ui (Radix) + Tailwind v4 + Zustand, bundled by `bun run build:web` into the committed `web/board.js` and `web/ui.css`; users install nothing and `dependencies` stays empty (every package is an exact-pinned devDependency). Pages move over one at a time; Tasks list and task page are first. Old `web/board/` code shrinks each phase.

**Three levels, imports only downward** (`web/structure.test.ts` fails otherwise): `web/ui/` generic shadcn pieces (may import only `web/lib/utils.ts`, kebab-case, one per file, the only place a Radix package or cmdk is imported) -> `web/components/` kaizen pieces built from `ui/` (one component per file, file name is the export) -> `web/pages/` one per view, layout plus data. `web/lib/` holds `api.ts`, `store.ts` (Zustand), `tasks.ts` (pure rules and types), `host.ts`, `toast.ts`, `hooks/`; it imports only lib. Lib never imports `web/board`: the bridge `web/board/react-mount.ts` hands the old code's functions over once through `setHost()` (go, newTask, runPopup, attention, scope).

**Rules.** Popovers, menus, selects, pickers, dialogs and tooltips come from `ui/` and render into `#kz-portal` (`portalRoot()`); a page never builds one. Styling uses theme names only (`bg-background`, `text-muted-foreground`, `border-border`, never hex or `rgb(`); `web/theme.css` maps the board's CSS variables, so light, dark, blue and motion work unchanged. Button `variant` is `primary` (the one main action of an area), `default`, `ghost`, `danger`; `size` `md` or `sm`; an icon-only control is `IconButton`, never a `Button`. Every input goes through `Field` (label, control, help, error with `aria-describedby`). Data loading and actions live in `lib/hooks` (`useTasks`, `useTask`, `runAction`, `sendMessage`), not in components, so two places showing the same decision share one code path. A `border-<side>` plus an arbitrary colour needs `border-[color:...]`, or tailwind-merge drops one of them.

**Component map** (today's pattern -> piece): `.btn` -> `ui/button`; `.ib` -> `icon-button`; `ico()` -> `ui/icon` (the board's sprite); filter popup -> `filter-menu`; "..." menu -> `action-menu`; `combo` picker -> `picker`; `.sel` -> `ui/select`; `.ice-chip` -> `chip`; status dot/word -> `status-badge`; approve/answer/project strip -> `decision-bar`; labelled input with button -> `inline-form`; label+control+help+error -> `field`; chat -> `chat-bubble`, `typing-dots`; empty list -> `empty-state`; row -> `task-row`; outputs -> `result-view`, `result-checks`, `artifact-view`; confirm -> `confirm-dialog`; `toast()` -> `lib/toast.ts` (old `board/toast.ts` forwards once the board mounts it; the notebook and Video pages keep their own so React stays out of their bundles); pager -> `pager`. Built in later phases: `ui/tabs`, `ui/switch`, `ui/dialog`/`sheet` consumers, `action-menu` for card menus.

**Add a shadcn piece:** copy its source into `web/ui/`, change the imports to `../lib/utils.ts`, restyle with theme names to the board's sizes (`--btn-*`, `--r-*`, `--fs-*`), make its portal use `portalRoot()`, import the Radix part from `radix-ui`.

**Legacy layer.** `board.html` wraps all its CSS in `@layer legacy`, declared before `theme, base, components, utilities`, so Tailwind utilities always win over old rules and old rules never restyle new ones. Tailwind's reset is scoped to `.kz-ui` (each React root and `#kz-portal`), not global; `.kz-keep` marks a legacy element docked into a React page (search box `#bq`, `#newtop`) that the reset must skip. Unlayered CSS (`term.css`) outranks the layer, and layered `!important` reverses priority: check both when touching either. Do not put an old element's id on a `.kz-ui` root: the reset zeroes its padding.

## Notes
<!-- yours: /kaizen docs never rewrites this section -->
