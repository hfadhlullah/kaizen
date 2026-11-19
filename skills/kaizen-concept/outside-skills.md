# Outside design skills

Read this at step 2. kaizen-concept carries its own short rules (`references.md`,
`themes/`, `motion.md`, `slop-check.md`) and works with nothing else installed. Four
outside skills go much deeper in their own area. When the user has installed any of
them, the user decides whether this job uses them. kaizen never installs them by
itself.

| Skill | Installed as | Its own install command |
|---|---|---|
| Hallmark | a skill named `hallmark` | `npx skills add nutlope/hallmark -g` |
| Taste | a skill named `design-taste-frontend` | `npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend"` |
| Impeccable | a skill named `impeccable` | `npx impeccable install` |
| Emil Kowalski | skills named `animate`, `choreograph`, `review-animations` | `npx skills@latest add emilkowalski/skills` |

## Finding what is installed

Look for those skill names in the folders this agent loads skills from: for Claude Code
`~/.claude/skills/`, the project's `.claude/skills/`, and the plugin folders under
`~/.claude/plugins/`; for Codex `~/.codex/skills/`; and `~/.agents/skills/`. A skill
counts as installed when its folder holds a `SKILL.md`. Do not search anywhere else, and
do not read credentials or settings files while looking.

## Asking the user

Add one question to the interview round, only when at least one is installed:

`Q: Which design skills should this concept job use? (multi-select)` with one option per
installed skill, named by what it adds (for example "Hallmark: its 50 themes, page
shapes and the sloplint check"), and **kaizen-concept only**. Recommend the installed
ones for a landing page or website; for app screens, recommend Impeccable and Emil and
leave Hallmark and Taste unpicked, since those two are built for marketing pages.

When none is installed, do not ask. Say once, in one line, that these skills exist and
can be installed with the commands above if the user wants more depth, then go on.
Never run an install command unless the user asks for it in this conversation.

Carry the answer into the pick page as its `skills` value, so the Done post writes it
into `.preview/references/picks.md` as `Design skills: <names>` or
`Design skills: kaizen-concept only`. When the picks come in chat instead, write that
line yourself. Steps 6 and 7 read it from there.

## Where each one is used

Only the skills the user picked, and only at these steps. Read that skill's own
instructions for the part named; do not run its whole workflow.

| Step | Hallmark | Taste | Impeccable | Emil |
|---|---|---|---|---|
| 3 References | `theme.mjs deal` adds its 3 dealt themes, with their pictures, to the pick page | its palette and type deal adds one palette and one pairing to the pick page | | |
| 6a, 6b First screen | its hero review joins the first-screen review | | | |
| 6c Build | | | `polish`, and `bolder` on a flat section | `animate` and `choreograph` for the motion |
| 7 Slop check | `sloplint.mjs` on each prototype (static mode when its browser package is missing) | its copy lint on the visible text | `critique`, run by its own isolated reviewer | `review-animations` on each prototype |

Skills not picked are replaced by kaizen's own file for that step, exactly as when
nothing is installed.

## When they disagree

The outside skills were written separately and clash with each other and with briefs
(in a trial, Taste's checks failed a pinned scroll the brief asked for, and a page
rewrote the brief's fixed headline). Decide in this order:

1. The user's words, picks and approvals, the brief, and the brand.
2. kaizen-concept's own rules and flow: the steps, the user's decisions (interview answers, reference picks, OK on the cards, votes and
   revisions, final approval), sample
   data marked outside the app, two review rounds at most.
3. The outside skill.

A finding that conflicts with 1 or 2 is reported as declined, with the reason, never
silently dropped.

## Reporting

At step 8 the report says which outside skills ran, at which step, what each returned
(a sloplint count, a critique score, a verdict), and which were picked but could not
run, with why.
