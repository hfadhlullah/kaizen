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
mkdir -p ~/.claude/skills ~/.claude/agents
ln -s ~/kaizen/skills/kaizen ~/.claude/skills/kaizen
ln -s ~/kaizen/agents/kaizen-planner.md ~/.claude/agents/kaizen-planner.md
ln -s ~/kaizen/agents/kaizen-builder.md ~/.claude/agents/kaizen-builder.md
ln -s ~/kaizen/agents/kaizen-reviewer.md ~/.claude/agents/kaizen-reviewer.md
```

Symlinks instead of copies: `git pull` in the clone updates the live install.

## Update

```bash
cd ~/kaizen && git pull
```

## Layout

```
kaizen/
  skills/kaizen/     # SKILL.md, spec.md, config.default.yml, adapters.md, README.md
  agents/            # kaizen-planner.md, kaizen-builder.md, kaizen-reviewer.md
```
