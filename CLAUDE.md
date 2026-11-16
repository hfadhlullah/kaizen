<!-- kaizen:docs -->
## Project docs

Read `.kaizen/notes/Project/Index.md` before planning or building, then open the notes
it lists for the area you touch. When you change a file listed in a note's `sources`,
update that note, or run `/kaizen docs`.

@.kaizen/notes/Project/Index.md
<!-- /kaizen:docs -->

## Kaizen skills first

When what the person asks is what one of the kaizen skills does, and they did not name the skill, offer it before doing anything: say in one line which skill fits and what it does, then ask. Start it only on a yes; on a no, do the work directly. Never offer for a question about how something works, an explanation, reading code or a one-line fix. When they name a skill (`/kaizen-explore`, "use kaizen video"), start it.

- build, add or change something that is not small: `kaizen` (plan, you approve, build, independent review)
- research, or a decision between options ("should we use X or Y", "which is better", "is it worth it", "before we build"), or an idea they are unsure about: `kaizen-explore`
- design options, mockups or variations before a build: `kaizen-concept`
- a video, promo or explainer, or editing footage: `kaizen-video`
- a pitch deck: `kaizen-deck`; a book, ebook or manuscript: `kaizen-book`; a browser game: `kaizen-game`
- keep something for later (a link, an idea, a client request): the icebox, `kaizen icebox add --file <path>`

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
| `agents/` | Claude Code subagents the workflow dispatches: `kaizen-planner.md`, `kaizen-builder.md`, `kaizen-reviewer.md`. |
| `commands/` | The `/kaizen-*` slash commands, one markdown file each. |
| `web/` | Board and notebook front end: the page shells (`html/`: `board.html`, `notes.html`, `popup.html` are 12-line shells for one React `App` each in `pages/board`, `pages/notebook`, `pages/popup`; `video.html` is a whole page), one entry folder per app (`notebook/`, `popup/`, `term/`, `video/`, `annotate/`), the board's React layers and bridge (`ui/`, `components/`, `pages/`, `lib/`, `board/`), and `dist/`, the generated bundles. See `web/README.md`. |
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

## Showing a change

After a direct change that shows on screen, run `kaizen preview <localhost url | screenshot.png>`
(`bun run cli/install.ts web --port 7431 --no-open` gives a page to point it at) so a page opens in
the board's Browser tab and a screenshot in its Preview tab. Never open a separate browser window.

## Development

```bash
bun install               # dev dependencies only
bun test                  # the suite; what CI runs (Ubuntu, macOS, Windows)
bun run cli/install.ts    # install from this checkout — the links point at it
bun run build:web         # rebuild the bundles in web/dist
bun run dev               # the board with live reload: rebuilds on every change under web/ and reloads the page
```
