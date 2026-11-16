---
description: Which agent Home Chat runs on (Codex or Claude Code), what Claude may do there, and the skill offers in the chat brief
tags: [project, web-board]
sources: [cli/chat.ts, cli/chat.test.ts, cli/add-project.ts]
updated: 2026-11-16
---
# Home chat agent

Part of [[Web board]] and [[Web board/Home, chat and phone]].

## In plain words
Home Chat answers using Codex or Claude Code, whichever you use; this note says which one it picks, what Claude is allowed to do in Chat, and how Chat offers kaizen skills.

## What it does
Chat runs on Codex or Claude Code, chosen per chat (`chatAgent` in `cli/chat.ts`): the user's default agent when it is one of the two and installed (the board hands it in as `Board.defaultAgent`), else Codex, else Claude Code; neither shows "Chat needs Codex or Claude Code". The chat keeps `agent` (a chat from before had Codex) and never switches: its thread or session would not resume, so a removed agent says so. Claude runs `claude -p --output-format stream-json --verbose` with the brief on stdin, `--resume <session>` on the next message, always in the scratch folder (its sessions belong to the folder they began in, so a project switch keeps the thread; every project is added with `--add-dir`). It cannot ask, so `CLAUDE_ALLOW` is the whole permission set: Read, Glob, Grep, web search and fetch, read-only commands and `kaizen task|icebox|status|recall|related|roadmap|search|scrape|send|version`; `kaizen uninstall|upgrade|prune` are denied. Edit and Write are allowed only as `Edit(//<folder>/**)` and `Write(//<folder>/**)` for each project folder and the scratch folder: a bare `Edit`/`Write` rule lets Claude write to any path, even with the user's own settings off (checked 2026-11-16), so never add one. On Windows the rule path is `//c/Users/a/…` (from Claude Code's docs; not run on Windows, and a rule that does not match fails closed: the write is refused). A refused command shows as a failed step. `parseClaudeLine` turns the stream into the same events as Codex's `parseLine`; the model and effort are Settings → Models → Claude Code's (`agentFlags`, Claude's own default when unset). The chat's project `CLAUDE.md` (else `AGENTS.md`, first 16,000 characters) goes in as `--append-system-prompt` each turn, since Claude runs in the scratch folder and would not load it. Not in Chat: Gemini, OpenCode, Antigravity, Cursor. Run 2026-11-16-chat-default-agent. The brief carries `OFFER` from `cli/add-project.ts` (see CLI → The kaizen note in a project): a plain message that fits a kaizen skill gets a one-line offer, and on a yes the agent reads the skill's SKILL.md and follows it in the chat; a build request keeps the numbered lite/full offer and the `[[kaizen:run …]]` directive (run 2026-11-16-offer-skills). Adding a project from the board also writes the kaizen note into it, and the Existing folder dialog says so.
