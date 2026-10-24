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
| `review.executor` | `inline`, `subagent`, `ask` | Who reviews a lite run: this session, a cold reviewer agent, or ask before the review |
| `approvals.plan` | `true`, `false` | Stop and show the plan before anything is built |
| `approvals.review` | `true`, `false` | Stop after the review, before the run is called done |
| `approvals.each_file` | `true`, `false` | Confirm every individual edit |
| `auto_fix.enabled` | `true`, `false` | Fix findings without asking, or hand every one over |
| `auto_fix.min_severity` | `critical`, `high`, `medium`, `low` | How bad a finding must be to be fixed automatically |
| `auto_fix.max_iterations` | `1`–`5` | Fix and recheck rounds before what is left is escalated |
| `review.write_memory` | `true`, `false` | Let the reviewer append lessons to `memory.md` |
| `git.auto_commit` | `true`, `false` | Commit the work when a run finishes |
| `git.worktree_per_run` | `true`, `false` | Build each run on its own branch in its own worktree and land it by pull request |
| `ui.mouse` | `false`, `true` | Click to select, click again to act; while on, the terminal cannot select text |
| `subagents.model` | `inherit`, `opus`, `sonnet`, `haiku` | Model the stage subagents run on (Claude Code only) |
| `subagents.effort` | `inherit`, `low`, `medium`, `high` | Reasoning effort for the stage subagents (Claude Code only) |
| `sources.every` | `off`, `1h`, `6h`, `24h` | How often the web board checks request sources for new requests, into the icebox, while it runs |
| `sources.agent` | `ask`, `chatgpt`, `agent` | Who picks the posts that fit from social sources when Gather is pressed: the ChatGPT plan signed in from the Icebox, or your agent on `/kaizen gather` |
| `sources.model` | text | Model the ChatGPT plan gathers with; empty takes the first it lists |
| `sources.effort` | `low`, `medium`, `high` | Reasoning effort of that model while gathering |
| `agent.default` | `auto`, `claude`, `codex`, `agy`, `opencode`, `gemini` | Coding agent to launch from dashboard backlog |

Some settings only have an effect while another stands a certain way: the approvals
while `mode` is `approve`, `build.executor` and `subagents.*` while `runner` is `full` (`subagents.*` also reaches a lite
run's reviewer under `review.executor: subagent`), `review.executor` while `runner` is `lite`,
`auto_fix.min_severity` and `auto_fix.max_iterations` while `auto_fix.enabled` is
`true`, `sources.model` and `sources.effort` while `sources.agent` is `chatgpt`. When
printing one of these that has no effect now, say so beside its value. Still offer it:
a value set now applies once the other setting changes, and `/kaizen full` overrides
the runner for one run.

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

Settings not in the table — such as `state.dir` and the per-tool
`agent.<cmd>.model` / `agent.<cmd>.effort` the board launches a session with — are edited by
hand in `config.yml`, which is commented throughout. Say so rather than offering a
picker with thirty options.

`kaizen settings` in a terminal opens the same settings as a full-screen browser, for
someone who would rather see the whole file at once. Mention it when the user is
changing several at a time.
