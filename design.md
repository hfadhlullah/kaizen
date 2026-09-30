# Kaizen design

Source of truth for how kaizen looks, on every surface: terminal dashboard, web board,
README images, and any desktop wrapper that comes later. When a surface and this file
disagree, this file wins; fix the surface.

Direction: **two surfaces, one product**. The terminal dashboard is terminal-native:
monospace, glyphs, block wordmark. The web board is **calm studio**: the surface for
someone who has never opened a terminal, so it uses a system sans face, soft depth,
ordinary switches and buttons, and words that say what a thing is rather than which
file holds it. What the two share is what makes them one product: the palette, the
five columns, the status set, the tanuki, and the voice. Where a rule below differs by
surface, it says so; a rule that does not say applies to both.

## 1. Brand

- Name: `kaizen`, lowercase in prose and code. Wordmark uppercase block letters.
- Tagline: `改善  continuous improvement`. CJK first, then the English, dimmed.
- Voice: plain, short, no exclamation marks. Tells you what happened and what it needs
  from you. See the README and the dashboard copy for the register.

### Wordmark

Block-glyph ASCII art, the same one the installer prints. Two sizes exist:

- Large, 6 rows (`assets/make-images.py`, `WORD`) for images.
- Compact, 3 rows (`cli/dashboard.ts`, `WORDMARK`) for the terminal header.

On the web, use the compact one inside a `<pre>` in `--mono`, never an image, so it
stays crisp at any DPI and inherits the theme colour. Vertical gradient from `--ink-hi`
at the top row to `--accent` at the bottom row (the banner does the same, row by row).
The block wordmark is the one terminal-native element the web board keeps: it is the
logo, not a control.

### Mascot: the tanuki

A line-art tanuki: one continuous white outline, no fill, waving a leaf umbrella in the
left hand, holding a small bottle in the right. Round belly, ringed tail, mask around the
eyes. Source art `assets/kaizen.jpg`, cropped by `BOX` in `make-images.py`.

What it means: the tanuki is the reviewer. Cheerful, a little mischievous, never the one
doing the work; the one who looks at it afterwards and tells you what it found. Copy that
speaks *as* kaizen may have the tanuki beside it; copy that speaks as the builder agent
does not.

Rules:

- Outline only, single stroke colour equal to the surface's `--ink`. Never filled, never
  recoloured, never given a drop shadow or gradient.
- Two renderings, one per surface:
  - Terminal: the Braille block `TANUKI` in `cli/dashboard.ts`, 11 rows. Menu screen only.
  - Web and images: the alpha mask from `kaizen.jpg`. Export once to `assets/tanuki.svg`
    (traced outline) before the web board ships; PNG at 460 px is the fallback
    (`kaizen-avatar.png`).
- Placement: empty states only (no ideas, no runs) at 120 px centred with one line of
  copy under it. Not in the header; the wordmark carries the header alone. It is not a loading spinner and not a favicon at 16 px, where the lines
  collapse; the favicon is the wordmark `K` block.
- Never animated beyond a 200 ms fade-in on empty states.
- Never cropped: umbrella tip and tail must both be visible.

## 2. Colour

Dark is the default; light follows `prefers-color-scheme` or the Theme setting
(system / light / dark) stored in `localStorage`. Every colour is a custom property; no hex appears in component CSS.
Two helper tokens sit beside the table on the web: `--on-accent` (white, text on an
`--accent` fill) and `--shade` (the one shadow colour: navy at 10 % in light, black at
45 % in dark).

| Token | Dark | Light | Job |
|---|---|---|---|
| `--bg` | `#0c162f` | `#f6f8fc` | Page ground. Same as the banner. |
| `--bg-2` | `#121e3c` | `#ffffff` | Cards, panels |
| `--line` | `#22305a` | `#d9e0ee` | 1 px borders |
| `--ink` | `#eef2fa` | `#0c162f` | Body text, mascot stroke |
| `--ink-hi` | `#deeeff` | `#0c162f` | Wordmark top row |
| `--dim` | `#96aacd` | `#5b6b8c` | Secondary text, legend, key hints |
| `--accent` | `#486ed9` | `#2d50a5` | Wordmark bottom row, primary button, open card border, active tab, `full`/`lite` chips |
| `--run` | `#4fd6e6` | `#0f8fa3` | running icon and chip |
| `--ok` | `#5fd28a` | `#1f9d55` | done icon, success toast |
| `--warn` | `#e6b450` | `#a8720a` | waiting on you: icon, chip, strip count, Reject button |
| `--danger` | `#e85050` | `#c8322f` | Destructive confirm (Delete), high-severity finding |

Amber is the attention colour: a run that cannot move until you act is amber on the
icon, the chip, and the strip count. Red is spent only on the one destructive confirm
button and on high-severity findings; never on a card, never on form errors (use
`--warn` text). The TUI still shows a waiting run's name in red; that is the one place
the two surfaces differ, kept because the terminal has no chips.

Contrast: every text token on its ground passes 4.5:1. `--dim` on `--bg-2` dark is the
tightest pair; do not lighten `--bg-2` without rechecking.

## 3. Shape

Web board. Three radii, as tokens, nothing else:

| Token | Value | Used on |
|---|---|---|
| `--r` | `10px` | cards, menus, toasts, dialogs, inline forms, chips |
| `--r-s` | `6px` | buttons, inputs, selects, menu items, code blocks, segments |
| `--r-pill` | `999px` | strip filters, column counts, switches |

Edge-attached surfaces (header, footer, side panel) have no radius. Borders are always
1 px `--line`.

Depth is two shadows, both built from `--shade`, and nothing else:

| Token | Used on |
|---|---|
| `--shadow-1` | cards and buttons at rest, the switch thumb |
| `--shadow-2` | a hovered card, menus, inline forms, the side panel, toast, help |

The scrim behind the panel and the help dialog is `--bg` at 60 % with a 3 px blur.
No gradients on surfaces, no coloured shadows, no glow except the dictation field.

## 4. Type

Web board:

- UI face `--font`: `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue",
  sans-serif`. Code face `--mono`: `ui-monospace, "JetBrains Mono", "Cascadia Code",
  "SF Mono", Menlo, Consolas, monospace`, used only for the wordmark, code in rendered
  markdown, and the key caps in the shortcuts list. No web font download: the board is a loopback
  page and must look right offline.
- Sizes: `14px` body and card titles, `13px` buttons, selects, tabs, column headers,
  `12px` meta, ids, ages, hints, `11px` chips, `17px` panel title.
- Weight: regular body; `500` card titles, buttons, tabs, setting names; `600` column
  headers, panel title, markdown headings. Nothing bolder except the wordmark.
- Line height `1.5` body, `1.45` card titles.
- Rendered markdown: `h1`/`h2` `15px` weight 600; `h3` `12px` uppercase `--dim` with
  `0.08em` tracking. Code blocks `--bg` on `--bg-2`, `--r-s`.

Terminal: whatever monospace the terminal has.

## 5. Semantics: status icons and stages

Status is a 14 px circle icon, one per state, plus a word in the legend. Same set in the
TUI (as glyphs) and on the web (as SVG symbols `#s-<state>`).

| State | Web icon | TUI glyph | Colour | Meaning |
|---|---|---|---|---|
| idea | dashed circle | `·` | `--dim` | in `inbox.md`, no run yet |
| starting | empty circle | `◌` | `--dim` | run launched, no `state.json` yet |
| running | half-filled, pulsing | `●` | `--run` | `state.json` changed in the last 30 min |
| stalled | half-filled, faded | `◐` | `--dim` | no change for 30 min, not finished |
| waiting on you | circle with `!` | `●` | `--warn` | needs an approval or a decision |
| done | filled circle with check | `○` | `--ok` | |
| abandoned | circle with `×` | `○` | `--dim` | |

Red (`--danger`) is no longer used on the board at all. A waiting run is amber three
times: icon, chip, and the summary strip count. Red remains for the one destructive
confirm button (Delete) and for high-severity findings in the review panel.

Columns, left to right: **Ideas · Planning · Building · Review · Done**. A run's column
is derived from its stage by `columnOf` in the shared state module. The UI never decides
a stage and never lets a user drag a card across columns. The only user transition is
abandon, which is `/kaizen abort`.

Legend shows only the states currently on screen.

## 6. Layout: the board

Mouse first. Every action is a visible control or a menu item; keys are a second way in,
listed behind a `Keyboard shortcuts` link in the footer, never the only way.

```
┌ header ──────────────────────────────────────────────────────────────┐
│ KAIZEN (ascii)   [~/code/acme-api ▾]                 [New idea]  ⚙   │
├ strip ───────────────────────────────────────────────────────────────┤
│ ! 2 waiting on you   ◔ 1 running   ◑ 1 stalled          3 ideas · 7 runs │
├ columns ─────────────────────────────────────────────────────────────┤
│ Ideas 3  +     Planning 1      Building 2      Review 1      Done 2  │
│ ┌────────┐     ┌────────┐      ┌────────┐      ┌────────┐   ┌──────┐ │
│ │ card   │     │ card   │      │ card   │      │ card   │   │ card │ │
├ footer ──────────────────────────────────────────────────────────────┤
│ ◌ idea  ◔ running  ! waiting on you  ● done       Keyboard shortcuts │
└──────────────────────────────────────────────────────────────────────┘
```

- Header: `--bg-2` ground, the compact block wordmark (section 1), project `<select>` (at
  most `320px` wide), then right-aligned: `New idea` primary text button and a gear
  icon for Settings. The mascot is not in the header.
- Strip: one line of counts. Each count is a pill with a 1 px `--line` ring and its
  status icon, and is a filter toggle; the active filter gets a `--dim` 12 % fill.
  `waiting on you` is `--warn` with a `--warn` ring.
- Columns: CSS grid, five `minmax(200px, 1fr)`, `gap: 24px`, gutter `28px` (`16px`
  under 900 px). Under 900 px the grid is one column, headers sticky.
- Column header: `13px` weight 600, count after it in a `--dim` 12 % pill, no
  underline. The Ideas header carries a `+` icon that opens the new-idea form in place.
- Card ground is `--bg-2`; column ground is `--bg`. That contrast is the board.
- A column shows six cards, then one dashed `Show N more` line in `--dim` that unfolds
  it, and `Show less` folds it back. Per column, per page load.
- Done carries a `Clear ▾` ghost button opening a menu: older than a week, older than
  3 days, everything (each with its count), or `Pick which…`, which puts a checkbox on
  every Done card and swaps the button for `Cancel` / `Archive N`.
  Any card's `⋯` menu has `Archive`; the strip's `Archive N` toggles the archive view,
  same columns, cards at 70 % opacity, `⋯` offers `Restore`. Archiving never moves a
  run directory: it is a list in `<state>/archive.md`, ideas take inbox status
  `archived`, and the TUI hides both.
- Empty board: tanuki at 120 px, `Nothing here yet` in `16px` weight 600, one `--dim`
  line saying what kaizen does with an idea, a `New idea` button.

### Card

Linear's grammar in our palette. Three lines, each optional after the first.

```
◔ web-board                       4m   ⋯
web board from design.md
[! needs approval] [lite]
```

- Line 1 `.c-id`: status icon, run id in `--dim` (date prefix stripped; ideas read
  `idea`), age right in tabular digits. On hover the age is replaced by a `⋯` button.
- Line 2 `.c-title`: `14px` weight 500 `--ink`, wraps to two lines then clips.
- Line 3 `.c-chips`: chips, `22px` tall (taller only when a long project path wraps),
  `--r`, 12 to 14 % tinted fill of their colour, no border. A waiting chip says what is
  needed in words (`plan needs your approval`), never the config key. A state chip first when the run is waiting (`--warn`) or running
  (`--run`), then project when viewing all projects, then run kind (`full`/`lite` in
  `--accent`), then agent (`--dim`). No chips, no line. A run whose panel offers commit
  and push ends the line with a word-less git mark chip (`#c-git`): `--warn` while its work
  is not committed and pushed, `--ok` once it is. It says which on hover and does nothing.

### Chip marks

Kind and agent chips carry an 11 px mark before the word, drawn as our own strokes
(1.7 px, round caps), never a vendor's logo. Symbol ids are `#c-<key>`, keys match
`KNOWN_AGENTS` in the CLI and the `full`/`lite` run kinds:

| Key | Word | Mark |
|---|---|---|
| `full` | full | two circles side by side: planner and reviewer as separate agents |
| `lite` | lite | one circle: everything in one session |
| `claude` | Claude Code | eight-point asterisk |
| `codex` | Codex | hexagon with a small circle in it |
| `agy` | Antigravity | up arrow over a baseline |
| `opencode` | OpenCode | `>` prompt with an underscore |
| `gemini` | Gemini | four-point star |
| `cursor` | Cursor | pointer arrow |

Swapping in a real brand mark later means replacing one symbol's paths under the same
id, subject to that vendor's brand terms; no other change.
- Padding `12px 14px`, gap `6px`, `--r`, 1 px `--line`, `--shadow-1`. Hover:
  `--shadow-2` and a slightly brighter border. Open in the panel: `--accent` border
  and a 1 px `--accent` ring.
- No buttons on a card, ever. New zones are added as one more `.c-*` child; the card
  is a flex column and needs no other change.

### Card menu

`⋯` opens a popover under it: `--bg-2`, `--r`, 1 px `--line`, `--shadow-2`, items
`13px` with an icon, `--r-s` hover fill, a rule before the destructive item, which is `--danger`.
Ideas: Run · Edit · Reject · Delete. Waiting run: Review plan / See findings · Abandon.
Running or stalled: Open · Abandon. Done: Open. Click anywhere else closes it.

### Inline forms

A form replaces the card it acts on, in place, `--accent` border, `--shadow-2`. New
idea appears at the top of Ideas. Every form ends with a `Cancel` ghost button and one
primary: `Add idea`, `Save`, `Reject` (`--warn`), `Delete` (`--danger`), or
`Full run` with a secondary `Lite`. `--dim` copy says what happens (`Opens your agent
in a new terminal with the request typed in.`), and the run form adds one line saying
what Full and Lite each mean. A focused field has an `--accent` border and a 3 px
`--accent` 22 % ring. Enter submits, Esc cancels.

### Detail panel

Slides in from the right, `520px`, full height, `--bg-2`, `--line` left border,
`--shadow-2`, a blurred scrim over the board that closes on click. Header: title, one
`--dim` line of id and state, close icon. Tabs for runs: Request · Notes · Plan · Work ·
Preview · Review · Backlog, `--accent` underline on the active tab. An empty tab says
`No plan yet.`, never the file name. Backlog items carry a read-only checkbox in place
of the bullet: ticked in `--accent` when done, empty when open, empty with the text
`--dim` and struck through when rejected. Footer holds the decision buttons and nothing else:

- waiting on plan: `Approve plan` (primary) · `Change something` · `Abandon` (ghost)
- waiting on fixes: findings as checkboxes, `Fix ticked` (primary) · `Leave as is`
- running: `Abandon run` (ghost)
- done or abandoned: no footer

Settings opens in the same panel, one row per setting: its name (weight 500) with its
one-sentence help always visible under it in `--dim`, and its control on the right.
Three controls: a switch for on/off (36 × 20 px track, `--accent` when on, white
thumb), one segment per value for a small number (the chosen one `--accent`), a select
for a choice. A path is a text field. Rows are divided by 1 px `--line`. Config keys
are not shown; the settings file path is the tooltip on the panel's sub-line. Theme
lives here, not in the header.

Request sources opens in the same panel from a link icon left of the gear, one row per
source in the settings row shape: its label (or host) at weight 500, the full link and
the last result with its age under it in `--dim`, a ghost `Remove` on the right. A
failed gather is said in words in `--ink` at weight 500, not by colour: `--warn` text
does not reach 4.5:1 on `--bg-2` in light. Below the rows: a link field, an optional
label field, `Add source` (the panel's primary) and `Gather now`.

### Buttons and icons

Text buttons: `13px` weight 500, `--r-s`, 1 px `--line`, `--bg-2`, `--shadow-1`;
`.pri` is `--accent` fill with `--on-accent` text, one per view; `.ghost` has no
border or shadow and takes a `--dim` 12 % fill on hover. Icon buttons are 34 px
squares (26 px inside cards), `--dim` at rest, `--ink` on a `--dim` 12 % fill on hover,
always with `title` and `aria-label`. Icons are inline SVG symbols, 1.6 px stroke,
round caps: plus, gear, link, play, pen, x, trash, more. No icon fonts, no emoji.

## 7. Keyboard and motion

Keys mirror the TUI and work as a second option: `n` new idea, `e` edit, `x` reject or
abandon, `r` run, `a` all projects, `Esc` close, `?` this list. Inert while an input has
focus.

Motion: panel slide `180ms`, toast fade `200ms`, running icon pulse `1.6s`, card move
between columns `150ms`, hover and switch transitions `120ms`, menu fade-in `120ms`. `prefers-reduced-motion` makes all of it instant. No spinners;
liveness is the file mtime and the UI must not pretend to know more.

## 8. Notifications

One notification when a run starts waiting on you, and one when it is done. Title
`kaizen`, the logo (`assets/kaizen-logo.png`) as its icon, and a two-line body: what
happened, then the project.

```
kaizen
payroll-export — plan needs your approval
~/Projects/acme
```

| The run | Body says |
|---|---|
| awaits `approvals.plan` | `plan needs your approval` |
| awaits `approvals.review` | `review needs your approval` |
| awaits `approvals.each_file` | `an edit needs your approval` |
| awaits `findings` | `pick the findings to fix` |
| awaits anything else | `waiting on <key>` |
| is done | `done` |

The wording is `notice()` in the shared state module, not in either UI: the web gets it
on each card from `/state` and shows it through `Notification`, the TUI sends it through
`notify-send`. When to send is `notifier()`, beside it, and the server hands the page
that same function. Sent only for a run the board has already seen, when what it says
changes: never on load, never for a run that arrives already waiting, and not `done`
within a minute of the run leaving a wait, since you just finished it yourself.
Abandoned and
archived runs say nothing. The web asks for permission once, on the first `r`, never on
load.

## 9. Accessibility

- All colour meaning is doubled by a glyph or a word (the dot shapes differ; the legend
  names them). Never colour alone.
- Cards are `<button>`s inside `<ul>` per column; columns are `<section>` with an `h2`.
- Focus ring is the `--accent` outline; never `outline: none` without a replacement.
- Live region (`aria-live="polite"`) announces stage changes: `payroll export moved to
  review`.
- Zoom to 200 % must not break the layout; the single-column breakpoint handles it.

## 10. Do and don't

Do: keep the five columns, keep the status icon set, keep amber for waiting and red for
destructive only, keep the three radii and the two shadows, keep copy to one line where
the TUI keeps it to one line. On the web, say what a thing is in plain words: `Work`,
not `Impl`; `No plan yet`, not `No 01-plan.md yet`.

Don't: add avatars, add icon fonts, add a web font, add drag-and-drop between columns,
add a progress bar, add a third shadow or a coloured one, put buttons on cards, add a
splash screen, animate the tanuki, replace the block wordmark, draw a web control out of text glyphs (`[✓]`,
`▮▮▯`), show a file name or config key as primary copy on the web, or let the web
board show a state the TUI cannot.

## 11. Files

- `design.md` (this file)
- `assets/kaizen.jpg` mascot source, `assets/make-images.py` rebuilds every image
- `assets/tanuki.svg` traced outline, rebuilt by `make-images.py`
- `web/board.html` the board; tokens from sections 2 and 3 at the top of its `<style>`
- `cli/web.ts` serves it; `cli/state.ts` is the logic both boards share
