```
                                   ▄█▄
                                ▄███████▄
                             ▄█████████████▄
                          ▄█▀               ▀█▄
                       ▄█▀                     ▀█▄
                    ▄█▀                           ▀█▄
              ██╗  ██╗ █████╗ ██╗███████╗███████╗███╗   ██╗
              ██║ ██╔╝██╔══██╗██║╚══███╔╝██╔════╝████╗  ██║
              █████╔╝ ███████║██║  ███╔╝ █████╗  ██╔██╗ ██║
        ▄█▀   ██╔═██╗ ██╔══██║██║ ███╔╝  ██╔══╝  ██║╚██╗██║   ▀█▄
     ▄█▀      ██║  ██╗██║  ██║██║███████╗███████╗██║ ╚████║      ▀█▄
  ▄█▀         ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚═╝  ╚═══╝         ▀█▄
  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
```

<p align="center"><b>改善</b> — <i>your AI agent shows you the plan before it does the work,<br>and a second agent checks what it did.</i></p>

---

## The problem

You ask an AI agent for something. It disappears for two minutes, changes eleven
files, and tells you it's done. Now you have to work out what it actually did, and
whether any of it is right. If it went the wrong way at minute one, everything after
that was wasted.

kaizen puts two checkpoints in that gap.

**Before** it starts, you see a plan and say yes or no. **After** it finishes, a
second agent — one that never saw the first agent's reasoning, so it has nothing to
defend — reviews the work and reports what is wrong. You decide what gets fixed.

## See it

```
you    /kaizen the discount field lets you enter more than 100%

       ...

kaizen Here is the plan.

       This is a bug fix in the checkout code.
       Done means: a discount above 100 is rejected, and the existing tests still pass.
       Wrong means: valid discounts stop working.

       What I will do:
         1. Add a check in apply_discount() — cart.py:9
         2. Cover it with three tests — 0%, 100%, 101%

       Approve this plan?                    [ approve ]  [ change something ]

you    approve

       ...

kaizen Done, and reviewed. One problem found:

       1. cart.py:12  medium  A discount of exactly 100 now returns 0 instead of
                              being rejected. Fix: use > not >=.

       Fix it?                               [ yes ]  [ leave it ]
```

The run stopped twice: once for you to approve the plan, once to decide about a
finding. Everything else it did on its own.

## Install

```bash
bunx kaizen-agent
```

It walks you through where to install, then tells you what to type next. Works with
`npx` too. Restart your editor afterwards.

> If `bunx` gives you an old version it is serving a cache — `rm -rf /tmp/bunx-*-kaizen-agent*`.

Then, in a project you want to use it on:

```
/kaizen-init
/kaizen <what you want done>
```

That is the whole thing. Everything below is detail.

## How a run goes

| | Stage | What happens |
|---|---|---|
| 1 | **Plan** | Reads your request and the existing material, writes a plan. Changes nothing. |
| 2 | **You approve** | You see the plan and the work list. Say yes, or say what to change. |
| 3 | **Build** | Does the work, then proves it — runs the tests, opens the page, walks the steps — and records what actually came back. |
| 4 | **Review** | A different agent, which never saw stage 3's reasoning, checks the work and lists what is wrong, numbered and graded. |
| 5 | **Fix** | Serious findings get fixed and re-checked, up to a limit. Anything left over is handed to you, never quietly dropped. |

Each stage runs as its own agent with a clean slate, and writes a file before the
next one starts. That is what makes stage 4 worth anything: a reviewer that watched
itself write the code will defend it.

## Not only for code

kaizen is not a software workflow. The same five stages hold for a book chapter, a
launch email, a migration runbook, or a research memo.

Each run works out for itself what kind of work it is — its **track** — by answering
three questions from your request:

- **What is the deliverable?** A merged change, a chapter, a landing page, a runbook.
- **What counts as done?** Tests pass. The chapter reads end to end. A colleague can
  follow the runbook unaided.
- **What would make it wrong?** A security hole. A claim that is not true. A step
  that silently loses data.

The third answer is what the reviewer becomes. A reviewer hunting race conditions in
a book manuscript is worse than no reviewer at all, and the track is what prevents
it. You are never asked to categorise your own request — it reads the request and
tells you what it concluded, so you correct a sentence instead of filling in a form.

## Commands

| Command | What it does |
|---|---|
| `/kaizen <request>` | Start a run |
| `/kaizen-plan <request>` | Plan only — stop before anything is built |
| `/kaizen-auto <request>` | No approval stops; report at the end |
| `/kaizen-review [target]` | Review something that already exists |
| `/kaizen-status` | What is waiting on you, in flight, done |
| `/kaizen-approve` | Approve whatever the run is waiting on |
| `/kaizen-reject <reason>` | Send it back with a reason, or kill the run |
| `/kaizen-run` | Carry on with an approved plan |
| `/kaizen-backlog` | Everything noticed but not done, across all runs |
| `/kaizen-abort` | Abandon the current run |
| `/kaizen-init` | Set up the current project |
| `/kaizen-help` | The full card |

## What it writes

Everything a run knows lives in files in your project, not in a chat window:

```
.kaizen/
  config.yml            # how much it asks you, what it fixes on its own
  memory.md             # what past reviews learned about this project
  runs/2026-09-07-fix-discount/
    00-request.md       # what you asked, word for word
    01-plan.md          # the plan you approved
    02-approval.md      # what you decided, and why
    03-impl.md          # what changed, and the proof it works
    04-review.md        # findings, numbered and graded
    06-backlog.md       # what was noticed but not done
```

Plain files, so you can read them, commit them, and pick a run back up tomorrow —
or in another tool. kaizen also runs under Codex and Antigravity, and a run started
in one can be finished in another. See [adapters.md](skills/kaizen/adapters.md).

## Settings

`.kaizen/config.yml`, created by `/kaizen-init`. The three worth knowing:

| Setting | Default | Meaning |
|---|---|---|
| `mode` | `approve` | `approve` stops for you; `auto` never does; `plan-only` stops after the plan |
| `auto_fix.min_severity` | `high` | Findings this bad or worse get fixed without asking |
| `approvals.plan` | `true` | Stop and show the plan before anything is built |

Everything else is in [`config.default.yml`](skills/kaizen/config.default.yml), with
a comment on each key.

## Under the hood

- [`SKILL.md`](skills/kaizen/SKILL.md) — how the workflow behaves
- [`spec.md`](skills/kaizen/spec.md) — the tool-neutral contract every stage follows
- [`adapters.md`](skills/kaizen/adapters.md) — running it under Codex or Antigravity

<details>
<summary>Installer flags, updating, and installing without bun</summary>

| Flag | Effect |
|---|---|
| *(none)* | Ask, defaulting to every project (`~/.claude/`) |
| `--global` | Every project, no question asked |
| `--project` | Into `.claude/` in the current directory only |
| `--check` | Report what is linked, exit non-zero if anything is missing |
| `--force` | Replace a real file sitting where a link belongs |
| `--yes` | Take every default, ask nothing |
| `--verbose` | List every link instead of a one-line summary |

Re-running is safe: correct links are left alone. `bunx kaizen-agent` also updates —
it pulls the clone and links anything new.

To work on kaizen itself, install from your own checkout so the links point at it:

```bash
git clone https://github.com/hfadhlullah/kaizen.git ~/kaizen
cd ~/kaizen && bun run cli/install.ts
```

Without bun:

```bash
mkdir -p ~/.claude/skills ~/.claude/agents ~/.claude/commands
ln -s ~/kaizen/skills/kaizen ~/.claude/skills/kaizen
ln -s ~/kaizen/skills/kaizen-help ~/.claude/skills/kaizen-help
for f in ~/kaizen/agents/kaizen-*.md; do ln -s "$f" ~/.claude/agents/"$(basename "$f")"; done
for f in ~/kaizen/commands/kaizen-*.md; do ln -s "$f" ~/.claude/commands/"$(basename "$f")"; done
```

</details>

## License

MIT. *Kaizen (改善) is Japanese for continuous improvement — small changes, checked
as you go.*
