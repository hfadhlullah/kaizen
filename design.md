# Kaizen design

Source of truth for how kaizen looks, on every surface: terminal dashboard, web board,
README images, and any desktop wrapper that comes later. When a surface and this file
disagree, this file wins; fix the surface.

Direction: **terminal-native**. The web board is the TUI grown up, not a different
product. Someone who uses the dashboard should recognise the web board in one glance,
and vice versa.

## 1. Brand

- Name: `kaizen`, lowercase in prose and code. Wordmark uppercase block letters.
- Tagline: `改善  continuous improvement`. CJK first, then the English, dimmed.
- Voice: plain, short, no exclamation marks. Tells you what happened and what it needs
  from you. See the README and the dashboard copy for the register.

### Wordmark

Block-glyph ASCII art, the same one the installer prints. Two sizes exist:

- Large, 6 rows (`assets/make-images.py`, `WORD`) for images.
- Compact, 3 rows (`cli/dashboard.ts`, `WORDMARK`) for the terminal header.

On the web, use the compact one inside a `<pre>`, never an image, so it stays crisp at any
DPI and inherits the theme colour. Vertical gradient from `--ink-hi` at the top row to
`--accent` at the bottom row (the banner does the same, row by row).

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

Two radii, as tokens, nothing else:

| Token | Value | Used on |
|---|---|---|
| `--r` | `6px` | cards, buttons, inputs, selects, menus, toasts, dialogs, inline forms |
| `--r-s` | `4px` | chips, menu items, code blocks, strip filters |

Edge-attached surfaces (header, footer, side panel) have no radius. Borders are always
1 px `--line`. No shadows anywhere; depth comes from `--bg-2` on `--bg` and from the
border brightening on hover (`--line` to `--dim`).

## 4. Type

- One family: `ui-monospace, "JetBrains Mono", "Cascadia Code", "SF Mono", Menlo,
  Consolas, monospace`. No web font download.
- Sizes: `14px` body, `13px` card titles and buttons, `12px` meta, ids, ages, column
  headers, `11px` chips. Nothing larger except the wordmark.
- Weight: regular everywhere. `600` only for column headers and the panel title. Card
  titles are regular; a bold title on every card is noise.
- Line height `1.5` body, `1.45` card titles.
- Rendered markdown (plan, findings) uses the same family; headings are `12px` uppercase
  `--dim` with `0.08em` tracking, not bigger. Code blocks `--bg` on `--bg-2`, `--r-s`.

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

- Header: compact ASCII wordmark (the 3-row `WORDMARK`, in a `<pre>`, rows coloured
  `--ink-hi` to `--accent`), project `<select>`, then right-aligned: `New idea` primary
  text button and a gear icon for Settings. The mascot is not in the header.
- Strip: one line of counts. Each count is a filter toggle; active filter gets a
  `--dim` 12 % fill. `waiting on you` is `--warn`.
- Columns: CSS grid, five `minmax(200px, 1fr)`, `gap: 20px`, gutter `24px` (`16px`
  under 900 px). Under 900 px the grid is one column, headers sticky.
- Column header: `12px` weight 600, count in `--dim` after it, no underline. The Ideas
  header carries a `+` icon that opens the new-idea form in place.
- Card ground is `--bg-2`; column ground is `--bg`. That contrast is the board.
- A column shows six cards, then one dashed `Show N more` line in `--dim` that unfolds
  it, and `Show less` folds it back. Per column, per page load.
- Done carries a `Clear` ghost button: every finished run in view goes to the archive.
  Any card's `⋯` menu has `Archive`; the strip's `Archive N` toggles the archive view,
  same columns, cards at 70 % opacity, `⋯` offers `Restore`. Archiving never moves a
  run directory: it is a list in `<state>/archive.md`, ideas take inbox status
  `archived`, and the TUI hides both.
- Empty board: tanuki at 120 px, `Nothing here yet.`, a `New idea` button.

### Card

Linear's grammar in our palette. Three lines, each optional after the first.

```
◔ web-board                       4m   ⋯
web board from design.md
[! needs approval] [lite]
```

- Line 1 `.c-id`: status icon, run id in `--dim` (date prefix stripped; ideas read
  `idea`), age right in tabular digits. On hover the age is replaced by a `⋯` button.
- Line 2 `.c-title`: `13px` regular `--ink`, wraps to two lines then clips.
- Line 3 `.c-chips`: chips, `20px` tall, `--r-s`, 12 to 14 % tinted fill of their
  colour, no border. A state chip first when the run is waiting (`--warn`) or running
  (`--run`), then project when viewing all projects, then run kind (`full`/`lite` in
  `--accent`), then agent (`--dim`). No chips, no line.

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
- Padding `10px 12px`, gap `6px`, `--r`, 1 px `--line`. Hover: border `--dim`. Open in
  the panel: border `--accent`.
- No buttons on a card, ever. New zones are added as one more `.c-*` child; the card
  is a flex column and needs no other change.

### Card menu

`⋯` opens a popover under it: `--bg-2`, `--r`, 1 px `--line`, items `12px` with an
icon, `--r-s` hover fill, a rule before the destructive item, which is `--danger`.
Ideas: Run · Edit · Reject · Delete. Waiting run: Review plan / See findings · Abandon.
Running or stalled: Open · Abandon. Done: Open. Click anywhere else closes it.

### Inline forms

A form replaces the card it acts on, in place, same size, `--accent` border. New idea
appears at the top of Ideas. Every form ends with a `Cancel` ghost button and one
primary: `Add to inbox`, `Save`, `Reject` (`--warn`), `Delete` (`--danger`), or
`Full run` with a secondary `Lite`. One line of `--dim` copy says what happens
(`Opens Claude Code in a new terminal with the request typed in.`). Enter submits,
Esc cancels.

### Detail panel

Slides in from the right, `480px`, full height, `--bg-2`, `--line` left border, a
scrim over the board that closes on click. Header: title, one `--dim` line of id and
state, close icon. Tabs for runs: Plan · Impl · Review · Backlog, `--accent` underline
on the active tab. Footer holds the decision buttons and nothing else:

- waiting on plan: `Approve plan` (primary) · `Change something` · `Abandon` (ghost)
- waiting on fixes: findings as checkboxes, `Fix ticked` (primary) · `Leave as is`
- running: `Abandon run` (ghost)
- done or abandoned: no footer

Settings opens in the same panel: Theme (system / light / dark), Agent, Default run,
Notifications, as segmented text toggles. Theme lives here, not in the header.

### Buttons and icons

Text buttons: `13px`, `--r`, 1 px `--line`, `--bg-2`; `.pri` is `--accent` fill with
white text, one per view; `.ghost` has no border until hover. Icon buttons are 34 px
squares (26 px inside cards), `--dim` at rest, `--ink` with a `--line` border on hover,
always with `title` and `aria-label`. Icons are inline SVG symbols, 1.6 px stroke,
round caps: plus, gear, play, pen, x, trash, more. No icon fonts, no emoji.

## 7. Keyboard and motion

Keys mirror the TUI and work as a second option: `n` new idea, `e` edit, `x` reject or
abandon, `r` run, `a` all projects, `Esc` close, `?` this list. Inert while an input has
focus.

Motion: panel slide `180ms`, toast fade `200ms`, running icon pulse `1.6s`, card move
between columns `150ms`. `prefers-reduced-motion` makes all of it instant. No spinners;
liveness is the file mtime and the UI must not pretend to know more.

## 8. Notifications

Web `Notification` when a run enters *waiting on you* or *done*, title `kaizen`, body
`payroll export needs your approval`. Asked for permission once, on the first `r`, never
on load. The TUI's `notify()` sends the same text through `notify-send`, so the wording
lives in the shared state module, not in either UI.

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
destructive only, keep one monospace family, keep two radii, keep copy to one line where
the TUI keeps it to one line.

Don't: add avatars, add icon fonts, add drag-and-drop between columns, add a progress
bar, add shadows, put buttons on cards, add a splash screen, animate the tanuki, or let
the web board show a state the TUI cannot.

## 11. Files

- `design.md` (this file)
- `assets/kaizen.jpg` mascot source, `assets/make-images.py` rebuilds every image
- `assets/tanuki.svg` traced outline, to add before the web board
- `web/board.html` the board; tokens from sections 2 and 3 at the top of its `<style>`
- `cli/web.ts` serves it; `cli/state.ts` is the logic both boards share
