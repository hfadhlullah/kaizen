<div align="center">
<img src="https://raw.githubusercontent.com/hfadhlullah/kaizen/main/assets/banner.png" alt="kaizen" width="760">
</div>

<p align="center"><b>One tool to build and maintain your product with AI agents.</b><br>Requests in, a plan you approve, the work, an independent review, done.</p>

<p align="center"><img src="assets/hero.gif" alt="Animated walkthrough of the real kaizen board with sample data. 1: a request gathered from a support sheet waits in the Icebox and is promoted. 2: it is an idea on the board, and Run opens Claude Code. 3: the agent works in the card's own terminal and writes a plan. 4: the plan panel shows what done and wrong mean, and it is approved. 5: it builds, then a reviewer that never saw the work reports a high finding, a double charge. 6: only that finding is ticked and fixed. 7: the reviewer re-checks it. 8: the run lands in Done, with the low finding left in the backlog." width="760"></p>

## The problem

You ask an AI coding agent to retry a payment webhook when the bank times out. It starts editing at once, then says *"Done, tests pass."* The tests do pass. They were written by the same agent, from the same assumption: that a timeout means the charge failed. Sometimes the bank said yes and the reply got lost. Now a retry charges the customer twice, and nothing in the agent's report would make you look.

None of this is a lack of intelligence. It is a missing workflow:

| What goes wrong | What kaizen does |
| :--- | :--- |
| The agent decides what "done" means on its own, and you find out from the diff | It writes a plan first, including what *wrong* would look like, and waits for your approve or change |
| The author grades its own work, so its blind spot is in the code *and* in the check | A second agent that never saw the work reviews it, from the request, the plan and the diff only |
| Findings get fixed in an endless loop, or silently dropped | Serious findings are fixed and re-checked, at most twice; the rest come to you, and what is left goes to a backlog |
| Requests live in sheets, docs and social posts; the plan in one chat, the review in another, the commit somewhere else | One board, from an icebox that gathers those requests to an idea, a plan, the build, the review, the fix loop and the commit, every step on file |

Many assistants now ask for approval before they act, and some run a checker on their own draft. The difference here is *who* checks: a reviewer that shares the author's context shares its blind spots. Kaizen's reviewer starts cold, on purpose.

Every stage is a file in `.kaizen/runs/<id>/`, so a run can be resumed later, by another session or another tool (Claude Code, Codex, Antigravity), and read back when someone asks why the code is the way it is.

## Who it is for

**Good fit if you:**

- Build and maintain a product, and want one place for it: requests gathered from where they live, then plan, build, review and commit, without switching tools.
- Already use an AI coding agent, and have caught it confidently wrong more than once.
- Change things where a mistake is expensive: money, data, migrations, anything a customer sees.
- Want to see and steer the plan before code is written, not reverse-engineer it from a diff.

**Not for you if:**

- Your changes are typos and one-liners. A run costs several times one prompt; kaizen takes a short path for small work, but it is not free.
- You want the agent to ship without you. Kaizen is built to stop and ask.
- You do not use an AI coding agent. Kaizen runs inside one; it is not one.

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

Right after installing, `kaizen setup` walks you through your project, settings, this board and the phone app (it prints a QR code to scan).

### Phone app

The board is a PWA: installed from the browser, it opens full screen with the kaizen icon. It needs [Tailscale](https://tailscale.com/download) on this PC and on your phone, both signed in to the same account.

```bash
kaizen setup        # guided: starts the board, runs tailscale serve, prints a QR code
```

Scan the QR code with your phone camera, then **Add to Home screen** (iOS: Share menu; Android: browser menu, *Install app*).

By hand: run `kaizen web`, then `tailscale serve --bg 127.0.0.1:7420`, add `<pc>.<tailnet>.ts.net` to `~/.kaizen/web-hosts`, and open `https://<pc>.<tailnet>.ts.net` on the phone. Details in [docs/guide.md](docs/guide.md#from-your-phone-tailscale). Never use `tailscale funnel` — it publishes the board to the internet.

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
