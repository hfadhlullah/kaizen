# web/ — the board's front end

The board is React (Tailwind + Radix through `ui/`) built into `board.js`; `board/` is the older
bridge layer that mounts it. `bun run build:web` bundles everything and a test fails when the
committed bundles are stale. `structure.test.ts` enforces the rules below.

## Layers (imports only go downward)

```
pages/  ->  components/<feature>/  ->  ui/  ->  lib/core/utils.ts
                     \-> lib/<feature>/ (lib imports only lib)
```

| Folder | Holds |
|---|---|
| `pages/` | One file per board page: tasks, task, icebox, board, home, settings. Composes components; no logic of its own. |
| `components/<feature>/` | Pieces a page draws. Popups, dialogs and menus come from `ui/`, never hand-built, no `innerHTML`. |
| `ui/` | Flat, one file per control (button, dialog, popover, select...). The only place that touches Radix or cmdk. |
| `lib/<feature>/` | Rules, stores (zustand), actions (requests) and hooks for one feature. No JSX. |
| `board/` | The bridge: plain modules that mount the React pages (`react-mount.ts`) and drive the rest of the board. Being replaced; add nothing new here. |

## Feature folders

`components/<f>/` and `lib/<f>/` use the same name when both exist.

| Folder | What it is |
|---|---|
| `shared` | Pieces two or more features use: chip, icon button, field, picker, segmented, pager, project mark, empty state, confirm dialog and `AskHost`, mic/attach buttons, and the hooks `use-draft`, `use-narrow`, `use-pager`. |
| `core` (lib only) | Generic helpers and the base model: `api`, `host`, `utils`, `format`, `labels`, `toast`, `store` (the Tasks pages' state), `ask`, plus `board.ts` (the card/run model) and `brief`. |
| `task` | The Tasks list and one task: rows, status badge, chat bubbles, result view, artifact frame; `useTasks`, `useTask`, `useDock`. |
| `decision` | The decision bar a task or run waits on, and its forms (revise, reply, plan answers). |
| `icebox` | Icebox requests (row, card, phone row, swipe deck), capture box, sources (card, form, drawer), collections, board/kind/snooze menus. |
| `board` | The Kanban board: card, column, popups, the New task / run / card forms, the mode switch. |
| `run` | The run panel and run view: head, tabs, history, picker, footer, wait/empty states, file viewer, fix form; `run-actions`. |
| `git` | The run's Source control tab. |
| `settings` | Settings page rows, nav, sections, update bar; settings store and actions, update check, mic choice. |
| `phone` | Phone setup (QR, WhatsApp card) and the phone-sized new-run sheets. |
| `home` | Home: chat list, messages, composer, onboarding dialog; the home store. |
| `project` | Project picker, Add project dialog, workspace menu, branch rules. |
| `search` | The search palette and its matching. |
| `markdown`, `url` | The markdown renderer (component and parser) and `safeUrl`, kept apart so the notebook bundle takes only `safeUrl`. |

## Rules

- **Index.** Every feature folder has an `index.ts` exporting what other folders use. Import another
  folder through it (`../../lib/task/index.ts`), never a file inside it. Inside a folder, import files
  directly (that keeps barrels out of cycles). `import type` follows the same rule.
- **Size.** A folder over 25 files is split by feature.
- **Where to add a thing.** Used by one feature: that feature's folder. Used by two: `shared` (a
  component) or `core` (a helper), and add it to the index. A new feature: a folder in `components/`
  and `lib/` with an `index.ts`, and a row in the table above.
- **Names.** Kebab-case files (`task-row.tsx`, `use-task.ts`); the file's main export is its
  PascalCase name; hooks start with `use-`; stores end `-store`, request functions `-actions`.
  Tests live beside the code they test as `*.test.ts` (in the feature folder, or in `web/` next to `term-font.ts`), import the file they test directly, and are not counted in the 25-file limit; an `index.ts` never exports them. `structure.test.ts` stays in `web/` because it checks the whole tree.
- **Exceptions.** `ui/` takes `lib/core/utils.ts` directly. Six `board/` bridge files import one small
  lib file directly because they run in the notebook and Video bundles or in DOM-less tests, where a
  barrel would pull in the board's stores (list: `BRIDGE_DIRECT` in `structure.test.ts`).
- **Core's type imports.** `lib/core/api.ts` and `store.ts` use `import type` from `lib/task` and
  `lib/icebox` for data shapes; erased at build, so no runtime cycle.
