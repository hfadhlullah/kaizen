# Kaizen — install

Read for `/kaizen install`. Nothing else needs this file.

`/kaizen install` asks where the workflow should live: **global** (this machine, every
project) or **per-project** (this repo, committed, shared with the team). Both can
coexist; the project copy wins when present.

**Global.** Kaizen's source of truth is the repo at `~/kaizen` (symlinked in on this
machine). Installing or updating global kaizen means that repo is current and linked:

```bash
[ -d ~/kaizen ] && (cd ~/kaizen && git pull) || git clone <kaizen repo url> ~/kaizen
mkdir -p ~/.claude/skills ~/.claude/agents
ln -sfn ~/kaizen/skills/kaizen ~/.claude/skills/kaizen
for f in kaizen-planner kaizen-builder kaizen-reviewer; do
  ln -sfn ~/kaizen/agents/$f.md ~/.claude/agents/$f.md
done
```

Symlinks, not copies — future `git pull` in `~/kaizen` updates every project on this
machine at once. This only works because `~/kaizen` is a repo the installing user
controls; it is not something to hand a teammate.

**Per-project.** A teammate cloning this repo does not have access to `~/kaizen` (it
can be private, or simply not theirs), so the project copy must be self-contained —
real files, not symlinks, committed into the project:

```bash
mkdir -p .claude/skills/kaizen .claude/agents
cp ~/kaizen/skills/kaizen/*.md ~/kaizen/skills/kaizen/*.yml .claude/skills/kaizen/
cp ~/kaizen/agents/kaizen-*.md .claude/agents/
git add .claude/skills/kaizen .claude/agents/kaizen-*.md
```

Then commit. Updating a per-project copy later means re-running the `cp` lines against
a current `~/kaizen` and committing the diff — there is no live link to keep it in
sync automatically, by design.

`install` also offers to write the adapter files from [`adapters.md`](adapters.md) so
Codex and Antigravity follow the same spec, per-project only (a global adapter file has
nowhere sensible to live).
