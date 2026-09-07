# kaizen

Staged AI development workflow for Claude Code: plan → human approval → implement →
independent review → bounded fix loop. Each stage runs as its own subagent with clean
context; all run state lives in a portable `.kaizen/` directory so a run can be
resumed later, by another session, or by another AI tool (Codex, Antigravity).

See [`skills/kaizen/SKILL.md`](skills/kaizen/SKILL.md) for the full behavior and
[`skills/kaizen/spec.md`](skills/kaizen/spec.md) for the tool-neutral stage contract.
A quick-reference card ships separately as the `kaizen-help` skill.

## Install

```bash
bunx kaizen-agent
```

That clones the repo to `~/kaizen` (override with `KAIZEN_HOME`) and links the
skills, agents, and commands into `~/.claude/`. Re-running it pulls and relinks, so
it doubles as the updater. `npx kaizen-agent` works the same way.

To work on kaizen itself, clone first and install from the checkout — the links then
point at your working copy:

```bash
git clone https://github.com/hfadhlullah/kaizen.git ~/kaizen
cd ~/kaizen && bun run cli/install.ts
```

Flags, either way:

Run interactively with no flags and it asks where to install, as an arrow-key
choice; piped or scripted runs take the global install without asking.

| Flag | Effect |
|---|---|
| *(none)* | Ask, defaulting to every project (`~/.claude/`) |
| `--global` | Every project, no question asked |
| `--project` | Install into `.claude/` in the current directory only |
| `--check` | Report what is linked and exit non-zero if anything is missing |
| `--force` | Replace a real file sitting where a link belongs |

It is idempotent — an already-correct link is left alone, so re-running after a
`git pull` is safe and reports what changed.

Restart Claude Code after linking — skills load live, slash commands and the
statusline only pick up on session start.

<details>
<summary>Without bun</summary>

```bash
mkdir -p ~/.claude/skills ~/.claude/agents ~/.claude/commands
ln -s ~/kaizen/skills/kaizen ~/.claude/skills/kaizen
ln -s ~/kaizen/skills/kaizen-help ~/.claude/skills/kaizen-help
for f in ~/kaizen/agents/kaizen-*.md; do ln -s "$f" ~/.claude/agents/"$(basename "$f")"; done
for f in ~/kaizen/commands/kaizen-*.md; do ln -s "$f" ~/.claude/commands/"$(basename "$f")"; done
```

</details>

Symlinks instead of copies: `git pull` in the clone updates the live install.

## Update

```bash
bunx kaizen-agent
```

Symlinks mean a `git pull` in the clone updates the live install by itself; the
command above does the pull and relinks anything new in one step. `bun run
cli/install.ts --check` reports the state of every link without changing anything.

## Layout

```
kaizen/
  skills/kaizen/      # SKILL.md, spec*.md, config.default.yml, adapters.md, README.md
  skills/kaizen-help/ # quick-reference card
  agents/             # kaizen-planner.md, kaizen-builder.md, kaizen-reviewer.md
  commands/           # /kaizen-plan, -auto, -run, -review, -status, -backlog,
                      #   -approve, -reject, -abort, -init, -install
  cli/install.ts      # bun installer: links the three directories into .claude/
```
