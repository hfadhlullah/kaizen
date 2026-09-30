# Kaizen — settings

Read for `/kaizen config`. Nothing else needs this file.

`/kaizen config` reads the same chain — `.kaizen/config.yml`, then `~/.kaizen/config.yml`,
then `config.default.yml` — and prints the current value of each setting below with a
one-line meaning. Then it offers the settings as choices — the tool's structured
question mechanism, one option per legal value, never free text — and writes back
whichever the user picks. Write to whichever file in the chain already exists,
nearest first, so a change lands globally unless this project keeps its own config.

| Setting | Values | What it decides |
|---|---|---|
| `preset` | `low`, `medium`, `ultra` | Quick preset: low (inline/manual), medium (balanced), ultra (autonomous) |
| `mode` | `approve`, `auto`, `plan-only`, `review-only` | Where a run stops |
| `runner` | `full`, `lite` | Whether each stage is its own cold agent, or this session runs them all |
| `build.executor` | `subagent`, `inline`, `ask` | Who carries out the approved plan |
| `approvals.plan` | `true`, `false` | Stop and show the plan before anything is built |
| `approvals.review` | `true`, `false` | Stop after the review, before the run is called done |
| `approvals.each_file` | `true`, `false` | Confirm every individual edit |
| `auto_fix.enabled` | `true`, `false` | Fix findings without asking, or hand every one over |
| `auto_fix.min_severity` | `critical`, `high`, `medium`, `low` | How bad a finding must be to be fixed automatically |
| `auto_fix.max_iterations` | `1`–`5` | Fix and recheck rounds before what is left is escalated |
| `review.write_memory` | `true`, `false` | Let the reviewer append lessons to `memory.md` |
| `git.auto_commit` | `true`, `false` | Commit the work when a run finishes |
| `git.branch_before_implement` | `true`, `false` | Branch before building when on the default branch |
| `ui.mouse` | `false`, `true` | Click to select, click again to act; while on, the terminal cannot select text |
| `subagents.model` | `inherit`, `opus`, `sonnet`, `haiku` | Model the stage subagents run on (Claude Code only) |
| `subagents.effort` | `inherit`, `low`, `medium`, `high` | Reasoning effort for the stage subagents (Claude Code only) |
| `sources.every` | `off`, `1h`, `6h`, `24h` | How often the web board checks request sources for new ideas while it runs |
| `agent.default` | `auto`, `claude`, `codex`, `agy`, `opencode`, `gemini` | Coding agent to launch from dashboard backlog |

Rules for writing the file:

- **Change the value in place.** `config.yml` ships with a comment above every key
  explaining it; rewriting the file from a parsed object throws all of them away.
  Edit the one line.
- **Only what the user picked.** A key the user did not touch stays absent if it was
  absent — an absent key inherits the default, and writing every key out freezes
  today's defaults into the project forever.
- If `.kaizen/` does not exist yet, run `init` first, then continue.
- After writing, print the setting and its new value, and nothing else. No summary of
  the whole file.

Settings not in the table — the review checks, backlog and state paths, and the per-tool
`agent.<cmd>.model` / `agent.<cmd>.effort` the board launches a session with — are edited by
hand in `config.yml`, which is commented throughout. Say so rather than offering a
picker with thirty options.

`kaizen settings` in a terminal opens the same settings as a full-screen browser, for
someone who would rather see the whole file at once. Mention it when the user is
changing several at a time.
