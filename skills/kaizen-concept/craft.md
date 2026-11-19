# Craft

Read this at step 6c, after the first screen is built and before the other screens.
`SKILL.md` lists what to check in the craft pass. This file says how, with numbers.
`motion.md` owns every timing and easing value, `slop-check.md` owns what may never
ship, and `ux-rules.md` owns platform rules. When this file and one of those disagree,
they win.

Rules are tagged `[app]`, `[landing]` or `[all]`, as in `slop-check.md`. A landing rule
is never applied to an app screen. A brief from the user wins over every default here:
a font, colour or era they pinned stays, even if it looks like a reflex.

Ideas in this file are adapted from the Impeccable design skill by Paul Bakaus
(Apache-2.0) and the Hallmark craft guide (MIT), rewritten for kaizen. See `CREDITS.md`.

## How to use it

1. Name the concept's one-sentence world first: who uses it, where, in what light. Every
   choice below follows from that sentence, not from the product category.
2. Work in this order: type, space, colour, shape and depth, states, responsive. Each
   layer rests on the one before. Colour fixed before type and space hides weak
   hierarchy behind a pretty palette.
3. Put every value in a token in `:root`. A raw number in a rule where a token exists is
   a mistake.
4. After each layer, squint at a screenshot. If the order of importance moved, undo the
   last change.

Refine, do not redesign. If the concept's idea is wrong, say so in the notes and stop
polishing it. Polishing a look that is about to be replaced is wasted work.

## 1. Type

**Roles first, sizes second.** List the roles the screens need before choosing any
size. An app usually needs five: page title, section heading, body, label or meta, and
data. A landing page adds display and lead. Name roles by job (`--text-label`), not by
value (`--text-14`). Use the fewest roles that make the order unmistakable.

**Scale.** `[all]` Build the scale on a ratio of about 1.25 from a 16px body: 16, 20,
25, 31, 39, 49. Steps closer than 1.25 do not read as different jobs. Hierarchy past
five steps comes from weight and colour, not more sizes.

- `[app]` A fixed scale in `rem`, no fluid sizing. Dense screens must not shift with the
  window. Title 24 to 28px, section 18 to 20px, body 16px (13pt only in a desktop app), label
  12 to 13px but never under the floor in `slop-check.md`.
- `[landing]` Display may be fluid with `clamp()`. Hero head 56 to 84px at 1440 wide,
  never past 96px. The head, one sentence, the action and the visual still fit the first
  screen at 1280x800.

**Families.** At most two, one for display and one for body. One family in several
weights counts as one. Mono for code, ids and figures may be a third. A face that does
one job only, such as a wordmark, is an outlier and may not take a second job.
`slop-check.md` lists the reflex display faces. Choose the display face from the world's
sentence, then ask whether any other face would serve it equally. If one would, you
chose by habit.

**Weights.** Three at most across the whole concept, picked as extremes: 400 beside
700, or 300 beside 800. Weights 500 and 600 sitting next to 400 look like a mistake,
not a choice. Body below 400 on small text fails on most screens.

**Display.**
- Tracking: -0.02 to -0.03em on regular-width faces; 0 to -0.015em on condensed or very
  heavy ones. Never past -0.04em. If two letters touch, loosen it.
- Line height 1.0 to 1.15, tighter as the size grows. 1.2 on a display head looks
  inherited from the body.
- A head that wraps in capitals never goes under 1.0 line height.
- Headline length decides size. About 20 characters or fewer: full display size. 21 to
  50: display. 51 to 90: step down one size or break at the natural pause. Over 90:
  rewrite it.
- A head is one weight, one style, one colour. Stress comes from a line break or a size
  change, not from picking out a word.

**Body and reading.**
- Size 16px minimum on web and mobile. Never justified without hyphenation, never all
  capitals past a short label, never tracked past 0.05em.
- Measure 45 to 75 characters. Set it in `ch` on the text block, not on a wrapper.
- Leading moves against measure: a narrow 45ch column wants about 1.45; a wide 70ch
  column wants 1.6 to 1.7. Body leading is never under 1.4.
- Light text on a dark surface needs more room: add about 0.05 to the leading, a touch
  of tracking (0.01em), and consider one weight step up if thin strokes break up.
- Pick one paragraph rhythm: space between paragraphs, or a first-line indent. Both
  together mark the break twice.
- `text-wrap: balance` on headings and short centred blocks; `text-wrap: pretty` on
  body. Both are safe to ship, because a browser that ignores them wraps normally.
- A manual `<br>` goes only between phrases, and is checked at 375px, where it often
  lands badly.

**Labels and meta.** `[all]` The body face one step smaller, sentence case, no
tracking. Capitals belong to a wordmark or to a concept whose whole display voice is
uppercase.

**Numbers.** `tabular-nums` on any figure that changes or lines up in a column.
Right-align numeric columns. Use lining figures in tables and old-style figures only
in running prose in a book-like concept. Units sit after a non-breaking space
(`10&nbsp;MB`). Currency, dates and decimals use `Intl` for the market's own format.

**Pairing.** Contrast the pair in structure, not just in name. A serif display over a
sans body, a condensed head over a wide body, a mono for data. Two faces that are
nearly alike look like an error. Check the pair at body size on a real paragraph, not
on the specimen word.

**Details that show care.** Curly quotes, a true ellipsis, a real apostrophe. Optical
alignment of an icon beside a label: judge the rendered pair, not the box. A label set
with the cap height trimmed still looks low if most letters sit in the x-height, so
look at real labels at every size shipped.

## 2. Spacing and rhythm

**One scale.** Use a 4px base with these steps: 4, 8, 12, 16, 24, 40, 64, 96, 144. A
4-unit base gives the middle steps that an 8-only scale lacks. Use `gap` between
siblings and `margin` only to break the flow. No more than three optical nudges off the
scale in a concept, each with a reason.

**Group by distance before you add boxes.** Things that belong together sit closer than
things that do not. If a gap between two groups is not clearly larger than the gap
inside a group, no border will fix it. Try distance first, then a hairline, then a
tinted well, and only then a card. A card is for content that is interactive or of a
different kind on its own.

**Rhythm means contrast.** One spacing value repeated everywhere makes every part weigh
the same. Mix tight and generous on purpose.
- Space above a heading is larger than the space below it, at least 1.5x. A heading
  belongs to what follows.
- `[landing]` Gaps between sections 96 to 144px at desktop, 64 to 96 at 390 wide. The
  gaps differ from seam to seam. A band of paper change needs less gap than one without.
- `[app]` Consistent density per region: a toolbar is tight, a form is airy, a table is
  tight with a row height of 40 to 48px. Do not mix densities inside one region.
- Page margins: 16px on mobile, 24px under 960px, 24 to 48px above. Content has a
  `max-width`; it does not grow past about 1200px of reading area on a 1920 screen.

**Padding.** Inside a box, at least 12px on the sides of a control, 16 to 24px on a
card. Under 8px reads as cramped. Optical padding on a pill button is larger on the
sides than top and bottom (about 1.5 to 2 times).

**Alignment.** Choose one primary axis and hold it. Left-aligned text with a
left-biased layout is a decision. A centred stack of every element is the default,
and usually a sign nobody decided. Mixed alignment inside one block is a finding.

**Grids.** CSS Grid for the page, Flexbox inside components. Flex or grid children that
must shrink need `min-width: 0`. Icons and images take `flex-shrink: 0`. No empty cell,
no orphan on the last row of a grid; change the column count instead.

**The squint test.** Blur the screenshot until the words are gone. You should still
find the main element first, the supporting element second, and the groups. If the blur
shows one grey slab, the page has no hierarchy. If it shows five competing dark spots,
it has too many.

## 3. Colour

**Work in OKLCH.** Lightness and chroma move predictably there. Build ramps by stepping
lightness and lowering chroma toward both ends: a very light or very dark step cannot
hold the chroma of the middle steps without looking fluorescent or muddy.

**Four layers.**
- **Paper:** the page ground. Light: lightness 92 to 98%, chroma 0.005 to 0.015, hue
  toward the anchor. Dark: lightness 12 to 18%, chroma 0.008 to 0.015.
- **Ink:** body text. On light paper lightness 16 to 24%; on dark 88 to 96%. Tinted
  the same way. Never pure black on pure white, never `#000` or `#fff` as a surface.
- **Neutrals:** five to nine steps between paper and ink for borders, muted text and
  wells. Tint every one by 0.005 to 0.018 chroma toward the anchor hue. A grey with
  no tint next to a tinted accent looks dead.
- **Accent:** chroma 0.12 to 0.22, with its own paired text colour that is checked for
  4.5:1 on the accent fill. A focus colour on the accent's hue, 3:1 against both the
  paper and the accent.

**Pick the hue from the product's meaning and world, not from its category.** A bank is
not blue because it is a bank. Name why the hue fits this concept in the notes. Never
take a framework default (indigo-500 and its family) as the brand.

**Strategy.** Declare one before painting.
- **Restrained:** tinted neutrals plus one accent used as a signal, under about 5% of a
  screen: the primary control, the active nav item, a focus ring, a link on hover, the
  one series a chart argues from. The default for `[app]`.
- **Committed:** one colour carries 30 to 60% of the surface; the accent stays rare.
- **Full palette:** three or four named colours, each with a job and a size. Fits
  playful and editorial worlds.
- **Drenched:** the colour is the whole surface, and the ink and lines are taken from it.

A big surface colour that is part of the declared strategy is not "accent overuse".
Accent on every chip, date and keyword is.

**Rules that hold in every strategy.**
- Give each colour a written job. A colour without a job is decoration.
- Text on a coloured surface takes its tone from that surface, never grey. Change the
  text colour in the same rule that changes the surface.
- Use solid computed colours, not stacked transparency, for text and borders. Alpha is
  for overlays and shadows.
- Gradients: at most three stops, a reason for each, and none on text.
- Semantic colours (success, warning, error, info) stay consistent across the
  concept and always carry an icon or word as well (`slop-check.md`, status rule).
- In charts and data, make series differ by lightness, shape or label too, so colour is
  never the only code.
- Contrast is computed: 4.5:1 for body, 3:1 for large text, icons, input borders and
  focus rings.

**Dark mode done properly.** `[all]` Build it only when the brief asks for both modes or
the concept's world is dark. It is a second designed rendering of the same system, never
an inverted copy and never "swap the greys".
- Re-derive each token: paper at lightness 12 to 18% with a tint; ink at 92 to 96%;
  borders at about 26 to 34%; accent with chroma lowered by 0.02 to 0.04 and lightness
  raised by 5 to 10 points, since a saturated light-mode accent glares on dark.
- The hue never moves between modes. Contrast targets hold in both. If a pair fails
  after re-derivation, fix the pair, not the target.
- Elevation is lightness: each level above the page is about 3 points lighter. A card
  is lighter than its ground; a darker card reads as a hole.
- Drop shadows off. A shadow on dark reads as glow. Use the lightness step or an inset
  1px ring in the border colour.
- One heading colour. Per-heading colour variety that worked on light breaks on dark.
- Never `invert()` or `brightness()` an image. Use photos that hold on dark, or set a
  light one on a lighter well so it reads as a plate.
- Ship `color-scheme: light dark` so form controls and scrollbars follow. Set the mode
  before first paint with a small inline script, so the page never flashes the wrong one.
- Verify every pair numerically in both modes. A screenshot of one mode proves nothing
  about the other.

## 4. Shape and depth

**One elevation language per concept.** Choose it once from the world's sentence and
use it everywhere.
- Flat with hairlines (1px border in the border token).
- A tinted well, no border (the paper's second and third steps).
- A single soft shadow for things that float, such as menus and modals.
Never a hairline plus a wide diffuse shadow on every card of a row. A card has a border
or a shadow, not both.

**The surface ladder.** Whitespace, then a hairline, then a tinted well, then a card.
Climb to the next rung only when the one below fails to show the grouping. Vary the rung
between seams so the page is not one stamped container.

**Shadows.** A shadow means "above the page". It has an offset and a blur, and it is
tinted with the world's dark tone, not black. Keep one recipe, for example
`0 1px 2px` at 5% alpha for small lifts and one larger recipe for overlays. Two layers
at most. A hard offset shadow with no blur belongs only to a deliberately playful or
brutalist concept.

**Radii.** One value per level, concentric: an inner radius is the outer radius minus
the padding, never less than 2px. Cards 10 to 16px in a soft world, 0 to 4px in a
technical one. Pills only for small controls such as chips and toggles, not for
cards or large buttons by habit. Images take the card's radius or a value derived from it.

**Layering.** Keep a z-index scale with names: base, raised, dropdown, sticky, nav,
modal, toast, tooltip. Never two sticky bars at the top. A deliberate overflow lives on
a section that keeps `overflow: visible`; use `overflow-x: clip` on the page, not
`hidden`, so sticky still works.

**Icons.** One family, one stroke width, sizes from a short list (16, 20, 24). Never an
emoji, never inside a coloured tile. Icon-only buttons carry a label.

**Browser surfaces.** In a strongly themed concept, set the selection colour, caret
colour, scrollbar and focus ring to the world. They are cheap, and a default left in
tells the viewer the page was assembled.

## 5. Every state and edge case (harden)

A concept that works only with perfect data is a sketch. For each main screen, try the
worst case before capture.

**Control states.** Every control has default, hover (only where hover exists), focus
(visible, appears at once, 3:1), active (pressed), disabled, loading, error and
success. The focus ring never animates. A disabled control is not shown by opacity
alone: it also changes the cursor and drops its hover. Input borders keep one width
across states; the height of an input matches the button beside it. A pressed state
never shifts the layout.

**Content extremes.** Test each of these in the real prototype, not by thought.
- A 60-character name, a one-letter name, a long unbreakable string such as an email
  or a URL, and one with an emoji.
- Counts of 0, 1 and 1,284; a list of 0 items and of 200.
- A missing image or avatar: a designed fallback with initials, never a broken icon.
- A title that wraps to three lines; a number that grows by two digits.
- A string 30 to 40% longer, as in many translations. Fixed-width buttons break first.
- Text columns in flex or grid need `min-width: 0`, then a truncate (one line, ellipsis)
  or a clamp (2 to 3 lines) chosen by what the reader needs to see.

**Empty.** Say what goes here, why it matters, and give the action that fills it. An
empty table is not a blank rectangle.

**Loading.** A skeleton that matches the final shape, not only a spinner. Show a
spinner only after about 150 to 300ms, and keep it up at least 300ms so it does not
flash. Past 2 seconds, say what is happening.

**Error.** Beside its source, in plain words, with the fix, with the person's input
kept. Never "Oops". Name what happened, why if known, and what to do next. Validate on
blur first, then on input; the error replaces the helper text in the same reserved line
so the layout does not jump.

**Success.** Silent when the result is already visible. A toast only when the result is
not on screen. Reversible actions get Undo; irreversible ones ask with a named verb.

**Offline and slow.** `[app]` Show that data is stale or queued. A failed action keeps
its form and offers retry.

**Language and region.** Use logical properties (`margin-inline-start`,
`padding-block`) so right-to-left works. Format with `Intl`. Plurals come from rules,
not from adding an "s". Use real content in the product's own language; no lorem.

**Input details.** Correct input types, visible labels (a placeholder is not a label),
autofill-friendly names, 16px minimum in inputs on phones so the browser does not
zoom on focus.

## 6. Responsive adaptation

Adapting a screen is rethinking it for the new context, not shrinking it. Ask what
cannot fit, what cannot work (hover, tiny targets), and what is out of place.

**Breakpoints.** Two, in `rem`, shared by the whole concept: layout changes under about
60rem (960px) and type steps down under about 40rem (640px). Add a third only where the
content breaks. Detect capability, not width: `@media (hover: hover)` for hover styles
and `(pointer: coarse)` for larger targets.

**Desktop to phone.** `[all]`
- One column. Side-by-side groups stack in the order of importance, and DOM order
  matches visual order so focus does not jump.
- Side navigation becomes a bottom bar of 3 to 5 destinations (app) or a short menu
  (landing). Sticky headers stay thin.
- Hover-only information moves to a tap, a visible label or a sheet.
- Tables keep the column that names the row and the column that acts. Turn each row
  into a block with labels, or freeze the first column. Ten columns on a phone is a redesign.
- Targets 44px (48dp on Android); more room between neighbours.
- Dropdowns become bottom sheets. Secondary content goes behind tabs or an accordion.
- Body stays 16px. Do not shrink text to make things fit; shorten it.

**Phone to desktop.** `[all]` Use the space, but do not stretch.
- Multi-column, a persistent sidebar, side panels for detail (master and detail).
- Cap reading width and container width. Content must not spread to the edges of a 1920
  screen; grids hold their column count above 1440.
- Add what desktop allows: hover detail, keyboard shortcuts shown in menus, right-click
  and drag where they help, denser tables.

**Tablet.** Two columns, a side drawer, and both touch and pointer working. Check
portrait and landscape.

**Clickable text never wraps.** A button, a primary nav link or a call to action stays
on one line at every width from 320 to 1920. When one wraps: shorten the label; then
`white-space: nowrap` and let the row reflow; then collapse the row into a menu.

**Units.** `dvh` or `svh` for heights that meet browser chrome, never `vh` alone on a
hero. `width: 100%`, never `100vw`. With `viewport-fit=cover`, fold the safe-area inset
into the page margin: `max(16px, env(safe-area-inset-left))`.

**Images.** `width` and `height` on every image, to stop layout shift. Lazy-load below
the fold, never the largest first image. Use a different crop where the subject would
vanish at small size.

**Check widths.** As the platform table in `SKILL.md` says, plus 320 for any web
surface and a 200% text zoom. At each width look for horizontal scroll, wrapped
controls, clipped content and anything under a fixed bar.

## 7. Simplifying (distill)

Run this on a screen that feels busy. Say no to good ideas to make room for the one that
matters.

1. **Find the single job.** Write the one thing the screen must let a person do. If you
   write two, split the screen.
2. **List every element and sort it:** needed for the job, needed sometimes, or neither.
   Remove "neither". Hide "sometimes" behind one clear entry point.
3. **Merge before you delete.** Similar buttons become one with a menu. Related fields
   share a row. A fact said twice is said once.
4. **Cut containers.** Remove a border, background or card that does not carry a
   grouping the spacing cannot. Never nest a card in a card.
5. **Cut variation.** Back to one or two brand colours plus neutrals and semantic
   colours; one family, three to four sizes, two or three weights; one spacing scale.
6. **One primary action.** One filled button per screen. The rest are quieter.
7. **Reduce choices.** Fewer options per decision (four visible at most), smart
   defaults, inline editing in place of a modal flow.
8. **Linear flow.** Replace a clever grid with a simple column where the content allows;
   drop a sidebar and move its content inline.

Simplicity is not fewer features. It is fewer obstacles. After the pass, run the
squint test again and check that nothing the main flow needs was cut.

## 8. Two named passes: bolder and quieter

Use these on one section that reads flat or loud. The scope is the named section only.
Neighbours stay as they are.

### Bolder (a flat section)

A flat section usually dropped the strongest moves of its own concept. Bring it up to
what its neighbours already do, in the same vocabulary. Do not add colours, fonts,
radii or shadows the concept does not have.

1. **Name the strongest move already in the concept.** For example the hero's huge
   headline, a full-bleed colour band, or the mono data strip.
2. **Pick one decisive move for this section** from that list and make it
   unmistakable. One only. If every element gets louder, the section gets flatter.
3. **Give it a peak.** Change its rhythm: a much bigger or much smaller scale step, a
   change of paper, an image at full width, a pause of empty space around one line.
4. **Quiet the rest of the section** so the move reads: supporting text lighter,
   chrome removed.
5. **Skeleton test.** Remove the copy. Does the structure still say what the section
   is? If not, the boldness lives in the words, not the layout.

More effects are the opposite of bold. Glows, extra gradients and motion add noise.
Scale, contrast, weight, colour area and space add strength.

### Quieter (a loud section)

Reduce, do not strip the personality. A quiet section that is grey on white with one
weight and identical cards is a failure.

1. **Lower the volume of colour.** Saturation to about 70 to 85% of its value; fewer
   colours, neutrals leading, tints from the hue.
2. **Lower the weight.** 900 to 600, 700 to 500 where the face still holds shape.
3. **Take out decoration.** Gradients, blur, glow, extra shadows, texture that has no
   job. Thinner and lighter borders; flatten the layering.
4. **Smaller jumps in scale.** Compress the ratio between adjacent steps toward 1.25.
5. **Calm the motion** to the low end of `motion.md`: 8 to 12px of travel, its two easing
   tokens only, no bounce, no stagger.
6. **Add air.** `[landing]` More space and fewer words. `[app]` Less noise so the tool
   disappears.
7. **Keep one thing with character:** the display face, the one accent, one detail from
   the world. Quiet is edited, not blank.

Whichever pass you run, capture the section before and after and judge both with the
squint test. State in the notes which move you made and why. If the section needs a
different idea and not a different volume, say so rather than adding or removing effects.

## Order of repair

When a screen has many problems, fix them in this order and stop when the bar is met.

1. Broken or blocked tasks, and anything misleading.
2. Missing states and worst-case content.
3. Hierarchy and flow drift.
4. Inconsistency in type, space, colour, shape.
5. Cleanup: debug output, dead rules, unused tokens.

Do not perfect one corner while the rest of the concept is below the bar. A clean
mechanical check is a floor. It never proves the rhythm, the hierarchy or the idea.
