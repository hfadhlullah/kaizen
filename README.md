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
git clone <this repo> ~/kaizen
mkdir -p ~/.claude/skills ~/.claude/agents ~/.claude/commands
ln -s ~/kaizen/skills/kaizen ~/.claude/skills/kaizen
ln -s ~/kaizen/skills/kaizen-help ~/.claude/skills/kaizen-help
for f in ~/kaizen/agents/kaizen-*.md; do ln -s "$f" ~/.claude/agents/"$(basename "$f")"; done
for f in ~/kaizen/commands/kaizen-*.md; do ln -s "$f" ~/.claude/commands/"$(basename "$f")"; done
```

Restart Claude Code after linking — skills load live, slash commands and the
statusline only pick up on session start.

Symlinks instead of copies: `git pull` in the clone updates the live install.

## Update

```bash
cd ~/kaizen && git pull
```

## Layout

```
kaizen/
  skills/kaizen/      # SKILL.md, spec*.md, config.default.yml, adapters.md, README.md
  skills/kaizen-help/ # quick-reference card
  agents/             # kaizen-planner.md, kaizen-builder.md, kaizen-reviewer.md
  commands/           # /kaizen-plan, -auto, -run, -review, -status, -backlog,
                      #   -approve, -reject, -abort, -init, -install
```
