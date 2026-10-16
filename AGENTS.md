<!-- kaizen:docs -->
## Project docs

Read `.kaizen/notes/Project/Index.md` before planning or building, then open the notes
it lists for the area you touch. When you change a file listed in a note's `sources`,
update that note, or run `/kaizen docs`.

@.kaizen/notes/Project/Index.md
<!-- /kaizen:docs -->

## Project structure

kaizen is TypeScript on Bun with zero runtime dependencies. The CLI has no build step —
`cli/*.ts` runs as-is. The web front end ships prebuilt as `web/notebook.js`; rebuild it
with `bun run build:web` after editing `web/notebook.ts` or `web/notes-lib.ts` (a test
fails when the bundle is stale).

| Path | What it is |
|---|---|
| `cli/` | Installer and runtime behind every `kaizen` command. `install.ts` is the CLI entry; `state.ts` is the run engine; `web.ts` the board server; `dashboard.ts` the terminal board; `sources.ts` request sources; `settings.ts` config; `notes.ts` the notebook. Tests live beside the code as `*.test.ts`. |
| `skills/` | The workflow as Agent Skills folders: `kaizen/` holds `SKILL.md` plus the `spec*.md` stage contracts, `adapters.md` and `config.default.yml`; `kaizen-help/`, `story-deck/`, `story-video/` beside it. |
| `agents/` | Codex subagents the workflow dispatches: `kaizen-planner.md`, `kaizen-builder.md`, `kaizen-reviewer.md`. |
| `commands/` | The `/kaizen-*` slash commands, one markdown file each. |
| `web/` | Board and notebook front end: `board.html`, `notes.html`, `notebook.ts`, `notes-lib.ts`. |
| `bot/` | Kaizen Bot — a separate private package (chat server, agent runtime, desktop packaging) with its own tests and `package.json`. |
| `docs/` | User and internal docs, indexed in `docs/README.md`. |
| `design.md` | Design notes for the repo. |
| `.kaizen/` | This repo's own runs and sessions. Read `state.json` before touching a run. |

## Where to look

- Every doc, one line each — `docs/README.md`
- The guide: board, sources, settings, installer flags — `docs/guide.md`
- The workflow contract, stage by stage — `skills/kaizen/spec.md`, with `spec-plan.md`, `spec-build.md`, `spec-review.md`, `spec-main.md` beside it
- Every setting, commented — `skills/kaizen/config.default.yml`
- The full command card — `skills/kaizen-help/SKILL.md`
- Kaizen Bot — `bot/README.md`

## Development

```bash
bun install               # dev dependencies only
bun test                  # the suite; what CI runs (Ubuntu + Windows)
bun run cli/install.ts    # install from this checkout — the links point at it
bun run build:web         # rebuild web/notebook.js
```
