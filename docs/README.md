# kaizen docs

Every document in this repo, one line each. Start with the README and come here
when you need the next thing.

## Using kaizen

- [README](../README.md) — what kaizen is, installing it, your first run, developing it. Start here.
- [guide](guide.md) — the depth: the board (terminal and browser), the notebook, request sources, settings, installer flags, updating and uninstalling.
- [Kaizen Bot](../bot/README.md) — the chat front end for your board: its agents, the desktop app, providers, privacy.
- Bundled skills — `kaizen-deck`, `kaizen-video` and `kaizen-motion` live under [`skills/media/`](../skills/media/), each with its own card in its folder.

## Under the hood

- [`skills/kaizen/SKILL.md`](../skills/kaizen/SKILL.md) — how the workflow behaves: the stages, who runs them, the files a run writes.
- [`skills/kaizen/spec.md`](../skills/kaizen/spec.md) — the tool-neutral contract every stage follows; the `spec-*.md` files beside it are each stage's own contract.
- [`skills/kaizen/adapters.md`](../skills/kaizen/adapters.md) — running the same workflow under Codex, Antigravity, OpenCode, Cursor and Gemini CLI.
- [`skills/kaizen/config.default.yml`](../skills/kaizen/config.default.yml) — every setting, with a comment on each key.
- [`skills/kaizen-help/SKILL.md`](../skills/kaizen-help/SKILL.md) — the full command card.

## Internal notes

Working documents, not user documentation — read them if you are working on kaizen itself.

- [Contributing](../CONTRIBUTING.md) — set up, dogfooding non-trivial work, pull requests, bug reports.

- [`design.md`](../design.md) — design notes for the repo.
- [`bot/pilot/`](../bot/pilot/README.md) — the computer-use pilot: how it was scoped, and what it found.
