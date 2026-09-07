<div align="center">
<pre>
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
</pre>
</div>

<p align="center"><b>改善</b> — <i>your AI agent shows you the plan before it does the work,<br>and a second agent checks what it did.</i></p>

<p align="center">
  <a href="https://www.npmjs.com/package/kaizen-agent"><img alt="npm" src="https://img.shields.io/npm/v/kaizen-agent?color=2d50a5&label=npm"></a>
  <a href="https://github.com/hfadhlullah/kaizen/blob/main/LICENSE"><img alt="license" src="https://img.shields.io/npm/l/kaizen-agent?color=2d50a5"></a>
  <img alt="dependencies" src="https://img.shields.io/badge/dependencies-0-2d50a5">
  <img alt="works with" src="https://img.shields.io/badge/Claude%20Code%20%C2%B7%20Codex%20%C2%B7%20Antigravity-2d50a5">
</p>

---

## The problem

You ask an AI to do something real — write the launch email, draft the policy,
build the feature, plan the migration. It goes quiet, then hands back a finished
thing.

Now the work is yours. What did it actually change? Did it understand what you
meant? Is any of it wrong in a way you would only notice next week? And if it
misread you in the first thirty seconds, everything after that was wasted.

kaizen puts two checkpoints in that gap.

**Before** it starts, you see a plan and say yes or no. **After** it finishes, a
second agent — one that never saw the first agent's reasoning, so it has nothing to
defend — checks the work and tells you what is wrong. You decide what gets fixed.

## See it

Pick whichever looks like your work. The five stages are identical in all of them —
what changes is what *done* and *wrong* mean, which kaizen works out from your
request rather than asking you.

<details open>
<summary><b>A customer email</b> — pricing change announcement</summary>

```
you    /kaizen rewrite the onboarding email — the new pricing starts on the 1st

kaizen Here is the plan.

       This is a customer email, not a policy page.
       Done means: a customer knows what changes, when, and what to do — in one read.
       Wrong means: a claim we cannot stand behind, or someone thinks they are being
       charged more than they are.

       What I will do:
         1. Rewrite the opening so the date and the amount come first
         2. Add one line on what happens if they do nothing
         3. Keep the existing sign-off and legal footer untouched

       Not doing: touching the pricing page itself — say the word if you want that too.

       Approve this plan?                    [ approve ]  [ change something ]

you    approve

kaizen Done, and reviewed. Two things found:

       1. paragraph 2  high    "Your price will not change" is not true for annual
                               plans renewing after the 1st. Fix: name both cases.
       2. subject line low     14 words, cut off on mobile. Fix: lead with the date.

       Fix them?                             [ both ]  [ just 1 ]  [ leave it ]
```

Nobody told the reviewer to look for an untrue claim or a truncated subject line. It
read the request, concluded this was a customer email, and reviewed it as one.

</details>

<details>
<summary><b>Code</b> — a bug in checkout</summary>

```
you    /kaizen the discount field lets you enter more than 100%

kaizen Here is the plan.

       This is a bug fix in the checkout code.
       Done means: a discount above 100 is rejected, and the existing tests still pass.
       Wrong means: valid discounts stop working.

       What I will do:
         1. Add a check in apply_discount() — cart.py:9
         2. Cover it with three tests — 0%, 100%, 101%

       Approve this plan?

you    approve

kaizen Done, and reviewed.
       Verified: ran the suite — 47 passed, 0 failed. Before the change: 44 passed.

       One problem found:

       1. cart.py:12  medium  A discount of exactly 100 now returns 0 instead of
                              being rejected. Fix: use > not >=.
```

`done` is a passing suite, so the builder has to show the run and its numbers —
before and after. "It should work" is not accepted in any track.

</details>

<details>
<summary><b>Marketing</b> — a landing page for a launch</summary>

```
you    /kaizen landing page copy for the Pro tier launch

kaizen Here is the plan.

       This is launch copy aimed at existing free users, not new visitors.
       Done means: a free user understands what Pro adds and what it costs, and can
       act without opening another page.
       Wrong means: an overclaim, a benefit we do not actually ship, or a price that
       disagrees with billing.

       What I will do:
         1. Headline and subhead — lead with the one thing free users ask for most
         2. Four benefits, each tied to a shipped feature
         3. Price block, pulled from the billing config so it cannot drift
         4. One CTA, repeated twice

       Out of scope: the pricing page, the in-app upgrade banner.

       Approve this plan?

you    approve

kaizen Done, and reviewed. Three things found:

       1. benefits 3   high    "Unlimited exports" — the shipped limit is 500/month.
       2. headline     medium  Names a competitor. Legal reviews those; flagging, not fixing.
       3. CTA          low     "Get started" appears on the free signup too. Ambiguous.
```

The reviewer checked each claim against what actually ships. Finding 2 it refused to
fix on its own and handed to you — deliberately.

</details>

<details>
<summary><b>Research</b> — a decision memo</summary>

```
you    /kaizen should we move from per-seat to usage-based pricing? write it up

kaizen Here is the plan.

       This is a decision memo for the founders, not a market report.
       Done means: a recommendation with the reasoning shown, and the case against it
       stated fairly enough that someone could disagree on the evidence.
       Wrong means: a conclusion the evidence does not support, or only looking at
       the data that agrees with it.

       What I will do:
         1. Pull the last 12 months of seat counts and usage from the billing export
         2. Model both against actual accounts — who pays more, who pays less
         3. Name the three accounts that break the model, and by how much
         4. Recommend, with the strongest argument against it stated first

       Approve this plan?

you    approve

kaizen Done, and reviewed. Two things found:

       1. section 3  high    The recommendation rests on 4 accounts out of 60. That
                             is not stated where the conclusion is.
       2. section 2  medium  Churned accounts were excluded with no reason given —
                             they are the ones the model treats worst.
```

Nothing here was checked for tests or tone. `wrong` was defined as an unsupported
leap and cherry-picked data, so that is what the reviewer went looking for.

</details>

<details>
<summary><b>Operations</b> — a migration runbook</summary>

```
you    /kaizen runbook for moving the database to the new region on Saturday

kaizen Here is the plan.

       This is a runbook someone else executes at 2am, not a description of a plan.
       Done means: a colleague can follow it start to finish without asking a question.
       Wrong means: a missing prerequisite, no way back, or a step that silently
       loses data.

       What I will do:
         1. Prerequisites, with how to verify each one is true before starting
         2. Steps in order, each with the exact command and what you should see
         3. A rollback for every step that changes state
         4. The point of no return, marked

       Approve this plan?

you    approve

kaizen Done, and reviewed. Two things found:

       1. step 7   critical  No rollback after the DNS cutover, and it is not marked
                             as the point of no return. Fix: mark it, add the TTL wait.
       2. step 3   high      Says "restore the backup" but never says which backup or
                             how to confirm it is the right one.
```

</details>

## Install

```bash
bunx kaizen-agent
```

It walks you through where to install, then tells you what to type next. Works with
`npx` too. Restart your editor afterwards.

To update later:

```bash
bunx kaizen-agent upgrade
```

That pulls the latest workflow, relinks anything new, and clears the installer cache
`bunx` keeps — which is what otherwise leaves you on an old version without saying so.

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
| 3 | **Build** | Does the work, then proves it — runs the tests, checks the claim against its source, walks the steps — and records what actually came back. |
| 4 | **Review** | A different agent, which never saw stage 3's reasoning, checks the work and lists what is wrong, numbered and graded. |
| 5 | **Fix** | Serious findings get fixed and re-checked, up to a limit. Anything left over is handed to you, never quietly dropped. |

Each stage runs as its own agent with a clean slate, and writes a file before the
next one starts. That is what makes stage 4 worth anything: a reviewer that watched
itself do the work will defend it.

## How it knows what kind of work this is

kaizen is not a software workflow. The same five stages hold for a book chapter, a
launch email, a migration runbook, or a research memo — what changes is what
*deliverable*, *done*, and *wrong* mean.

Each run works that out for itself — its **track** — by answering three questions
from your request:

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

Everything a run knows lives in files next to the work, not in a chat window:

```
.kaizen/
  config.yml            # how much it asks you, what it fixes on its own
  memory.md             # what past reviews learned about this project
  runs/2026-09-07-onboarding-email/
    00-request.md       # what you asked, word for word
    01-plan.md          # the plan you approved
    02-approval.md      # what you decided, and why
    03-impl.md          # what changed, and the proof it works
    04-review.md        # findings, numbered and graded
    06-backlog.md       # what was noticed but not done
```

Plain files, so you can read them, commit them, and pick a run back up tomorrow —
or in another tool. kaizen also runs under Codex and Antigravity, and a run started
in one can be finished in another. See [adapters.md](https://github.com/hfadhlullah/kaizen/blob/main/skills/kaizen/adapters.md).

## Settings

`.kaizen/config.yml`, created by `/kaizen-init`. The three worth knowing:

| Setting | Default | Meaning |
|---|---|---|
| `mode` | `approve` | `approve` stops for you; `auto` never does; `plan-only` stops after the plan |
| `auto_fix.min_severity` | `high` | Findings this bad or worse get fixed without asking |
| `approvals.plan` | `true` | Stop and show the plan before anything is built |

Everything else is in [`config.default.yml`](https://github.com/hfadhlullah/kaizen/blob/main/skills/kaizen/config.default.yml), with
a comment on each key.

## Under the hood

- [`SKILL.md`](https://github.com/hfadhlullah/kaizen/blob/main/skills/kaizen/SKILL.md) — how the workflow behaves
- [`spec.md`](https://github.com/hfadhlullah/kaizen/blob/main/skills/kaizen/spec.md) — the tool-neutral contract every stage follows
- [`adapters.md`](https://github.com/hfadhlullah/kaizen/blob/main/skills/kaizen/adapters.md) — running it under Codex or Antigravity

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
| `upgrade` | Pull, relink, and clear the installer cache. No prompts. |

Re-running is safe: correct links are left alone.

`bunx` extracts a package once and reuses it without re-resolving, so a plain
`bunx kaizen-agent` can keep running an old installer even after a new one is
published. `upgrade` clears that copy, so the next run resolves fresh. The workflow
itself — skills, agents, commands — comes from the clone and updates on any run.

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
