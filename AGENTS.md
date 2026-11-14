<!-- kaizen:docs -->
## Project docs

Read `.kaizen/notes/Project/Index.md` before planning or building, then open the notes
it lists for the area you touch. When you change a file listed in a note's `sources`,
update that note, or run `/kaizen docs`.

@.kaizen/notes/Project/Index.md
<!-- /kaizen:docs -->

## Kaizen skills first

When a request is what one of the kaizen skills does, invoke that skill first instead
of doing the work inline: `kaizen-concept` for concepts, mockups or design options
before a build; `kaizen-explore` to question an idea before planning; `kaizen-deck`,
`kaizen-video`, `kaizen-book` and `kaizen-game` for a pitch deck, a video, a book or
a game. The skill holds the steps and the quality bar the work needs.

## Project structure

kaizen is TypeScript on Bun with zero runtime dependencies. The CLI has no build step —
`cli/*.ts` runs as-is. The web front end ships prebuilt in `web/dist/` (`board.js`, `notebook.js`, `popup.js`, `term.js`, `video.js`, `annotate.js`, and the stylesheets `ui.css`, `board.css`,
`notebook.css`, `popup.css`) and the bot's `bot/web/app.js`; rebuild them with
`bun run build:web` after editing any TypeScript or stylesheet (`web/ui/`) under `web/` (or `bot/web/app/`) (a test fails when a bundle
is stale).

| Path | What it is |
|---|---|
| `cli/` | Installer and runtime behind every `kaizen` command. `install.ts` is the CLI entry; `state.ts` is the run engine; `web.ts` the board server; `dashboard.ts` the terminal board; `sources.ts` request sources; `settings.ts` config; `notes.ts` the notebook. Tests live beside the code as `*.test.ts`. |
| `skills/` | The workflow as Agent Skills folders: `kaizen/` holds `SKILL.md` plus the `spec*.md` stage contracts, `adapters.md` and `config.default.yml`; `kaizen-help/` beside it; `media/` holds the bundled media skills `kaizen-deck/`, `kaizen-video/` (footage editing and from-scratch films), `kaizen-book/`. |
| `agents/` | Codex subagents the workflow dispatches: `kaizen-planner.md`, `kaizen-builder.md`, `kaizen-reviewer.md`. |
| `commands/` | The `/kaizen-*` slash commands, one markdown file each. |
| `web/` | Board and notebook front end: the page shells (`html/`: `board.html`, `notes.html`, `popup.html` are 12-line shells for one React `App` each in `pages/board`, `pages/notebook`, `pages/popup`; `video.html` is a whole page), one entry folder per app (`notebook/`, `popup/`, `term/`, `video/`, `annotate/`: the annotator's page script), the board's React layers and bridge (`ui/`, `components/`, `pages/`, `lib/`, `board/`), and `dist/`, the generated bundles. See `web/README.md`. |
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
bun run build:web         # rebuild the bundles in web/dist
```

## Task deliverables
For persistent task results, publish only visual screenshots (`.png`) as deliverable artifacts. Do not attach `.md` summary files or raw code files as task result artifacts.
