<div align="center">
<img src="https://raw.githubusercontent.com/hfadhlullah/kaizen/main/assets/banner.png" alt="kaizen" width="760">
</div>

<p align="center"><b>See the plan before your AI starts. Get a second opinion when it is done.</b></p>

**The problem:** an AI agent starts writing before you agree on what it should do, then grades its own work.

**Kaizen:** it plans first and waits for your approval, then an agent that never saw the work reviews it.

## Install

### macOS and Linux

```bash
curl -fsSL https://bun.sh/install | bash && ~/.bun/bin/bunx kaizen-agent
```

Already have Bun? Run `bunx kaizen-agent`.

You also need an AI coding agent such as [Claude Code](https://docs.claude.com/en/docs/claude-code), and Git for the board's commit and push.

### Windows

Windows support is still in beta. In PowerShell:

```powershell
irm bun.sh/install.ps1 | iex; & "$env:USERPROFILE\.bun\bin\bunx.exe" kaizen-agent
```

Already have Bun? Run `bunx kaizen-agent`. As on macOS and Linux you need an AI coding agent; Git is only needed for the board's commit and push.

## Use the board

```bash
kaizen web
```

<img src="https://raw.githubusercontent.com/hfadhlullah/kaizen/main/assets/board-v2.png" alt="kaizen board" width="760">

The board opens in your browser. The side menu holds the board, notes, the icebox of gathered requests and settings, with a light and dark switch. From there you can start a run, approve or revise its plan, pick which review findings to fix, then commit and push.

To add a launcher (Spotlight on macOS, the app menu on Linux, a Desktop shortcut on Windows), run `kaizen web --shortcut` once.

## Development

TypeScript on [Bun](https://bun.sh) 1.1 or newer, zero runtime dependencies. No build step for the CLI — `cli/*.ts` runs as-is — and the web front end ships prebuilt.

```bash
git clone https://github.com/hfadhlullah/kaizen.git && cd kaizen
bun install               # dev dependencies only
bun test                  # the suite; what CI runs
```

To work on kaizen, install from your checkout so every link points at it:

```bash
bun run cli/install.ts
```

Skills, agents and commands are symlinked into every AI agent it finds; re-running is safe. From a checkout the workflow updates on any run, and `kaizen upgrade` leaves your local edits alone — update them with git.

After editing `web/notebook.ts` or `web/notes-lib.ts`, rebuild the committed bundle:

```bash
bun run build:web         # rewrites web/notebook.js; a test fails if it goes stale
```

### Layout

| Path | What it is |
|---|---|
| `cli/` | The installer and the runtime behind every `kaizen` command: `install.ts` (the CLI), `state.ts` (runs), `web.ts` (board server), `dashboard.ts` (terminal board), `sources.ts`, `settings.ts`, `notes.ts`. Tests beside them. |
| `skills/` | The workflow as Agent Skills folders: `kaizen/` (`SKILL.md`, the `spec-*.md` stage contracts, `adapters.md`, `config.default.yml`), `kaizen-help/`, `story-deck/`, `story-video/`. |
| `agents/` | The Claude Code subagents: `kaizen-planner`, `kaizen-builder`, `kaizen-reviewer`. |
| `commands/` | The `/kaizen-*` slash commands, one file each. |
| `web/` | The board and notebook front end: `board.html`, `notes.html`, `notebook.ts`. |
| `bot/` | Kaizen Bot — a separate private package with its own tests and build. See [its README](bot/README.md). |
| `docs/` | The guide and internal notes, indexed in [`docs/README.md`](docs/README.md). |
| `design.md` | Design notes for the repo. |
| `.kaizen/` | This repo's own runs — kaizen is built with kaizen. Gitignored: a fresh clone gets it on its first run. |

### Kaizen Bot

```bash
cd bot
cp .env.example .env      # PROVIDER, MODEL, that provider's key
bun start                 # http://127.0.0.1:7430 — run `kaizen web` first
bun test
bun run build             # the desktop app, into dist/
```

### Contributing

Pull requests; CI runs `bun test` on Ubuntu and Windows and it must pass. For non-trivial work, dogfood: `/kaizen <change>` in this repo plans, builds and reviews it — [`skills/kaizen/spec.md`](skills/kaizen/spec.md) is the contract the stages follow.

## License

MIT
