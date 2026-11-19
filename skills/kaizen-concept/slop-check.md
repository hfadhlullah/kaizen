# Slop check

Two readers use this file. The **builder** reads the Floor before building, so the
first version is already clean. A **fresh reviewer** reads all of it at step 7 and
checks every prototype before the user sees anything. The agent that built a concept
is its weakest reviewer: it remembers what it meant, not what it made.

Rules are tagged by where they apply: `[all]`, `[app]` (app, tool and dashboard
screens), `[landing]` (marketing pages). A landing-page rule is never applied to an app
screen. The sources of the UX rules are in `ux-rules.md` (ids such as A3 or U15).

## Tiers

- **Floor:** never shown to the user. Fix it.
- **Reflex:** a default that models fall into. Fix it, or keep it with a reason written
  in the concept's notes that names this concept ("the mono labels are the train
  numbers riders read on the platform"). A reason that would fit any concept is not a
  reason. More than 3 kept Reflex items in one concept is itself a finding.
- **Finish:** craft detail. Reported, never blocking.

## Floor

**Colour and surface**
- `[all]` Every colour and font comes from tokens in `:root`; no stray hex values in rules.
- `[all]` No gradient text. No purple-to-blue, purple-to-pink, or cyan-on-dark gradients anywhere.
- `[all]` No card inside a card.
- `[all]` No decorative coloured stripe down one side of a card or callout. Use a full border, a tint, or an icon.
- `[all]` Text contrast 4.5:1, large text, icons, input borders and focus rings 3:1, computed, in every theme shown (U1, U2).
- `[all]` Status is never shown by colour alone (U5).
- `[all]` No floating blobs or orbs.
- `[all]` A visual device (glass, a gradient on the one primary button, a pulse on a map pin) appears only with its job written in the concept's notes.

**Type and labels**
- `[all]` No eyebrow: a small label, tag or pill whose only job is to announce the heading under it.
- `[all]` No tracked capitals for labels: text at 15px or under set in capitals or with letter spacing above 0.03em.
- `[all]` No single word picked out in a heading by italic, colour, weight or underline.
- `[all]` Body text at least 16px on web and mobile (13pt on a desktop app), never under 12px anywhere.

**Content and truth**
- `[all]` No invented numbers, testimonials, customer logos, case-study counts, awards or ratings presented as real. Sample data is labelled outside the app frame (SKILL.md, step 8).
- `[all]` No lorem ipsum, "John Doe", "Acme", `[Company Name]`, or round placeholder amounts.
- `[all]` No form that shows "Sent" or "Thanks" without doing anything visible in the prototype's own logic.
- `[all]` No emoji used as icons; one icon family at one stroke width (A7, K20).
- `[all]` No sparkle or star icon for AI.
- `[all]` No drawn illustration standing in for the product: an SVG or CSS scene of a phone, dashboard or person where the real screen should be.
- `[all]` No hand-drawn browser bar or OS window inside the page; the frame comes from the review page (SKILL.md, platform table).

**Words**
- `[all]` None of: seamless, powerful, robust, smart, elevate, empower, unlock, unleash, supercharge, effortless, next-level, next-generation, world-class, best-in-class, cutting-edge, game-changer, revolutionary, transformative, holistic, leverage, synergy, journey, ecosystem, delve, and their translations. A literal use stays (a safety harness).
- `[all]` None of these stock lines, or lines shaped like them: "Imagine a world where", "at your fingertips", "In today's fast-paced world", "Look no further", "Join thousands of", "X made simple", "Say goodbye to", "Trusted by teams worldwide".
- `[all]` No em dashes, and no middle dot (·) separators between bits of meta. No "Not X. A Y." or "No X. No Y." runs: one per page at most.
- `[all]` Buttons say the action: never "Submit", "OK", "Learn more", "Get started", "Discover" alone (A5).

**Layout and motion**
- `[all]` No horizontal scroll at any check width; no element wider than the screen at 320px.
- `[all]` Every interactive element has a visible `:focus-visible` state that appears at once.
- `[all]` Nothing is hidden at rest waiting for a script to show it.
- `[all]` A `prefers-reduced-motion` block exists for every animation (`motion.md`).
- `[all]` No `transition: all`; no animated width, height, top, left, margin or padding.
- `[all]` Anything moving longer than 5s next to other content has a pause control.
- `[landing]` The headline, one sentence, the main action and the main visual are all visible in the first screen at 1280x800, and the hero is not sized in `vh` alone.
- `[app]` Navigation fits the platform, and every main screen has its states (SKILL.md, UX and platform rules).
- `[app]` No fake dashboard of charts and stat cards standing in for the product's real working screen.
- `[app]` No cards inside cards, and no same button repeated on every row; make the row tappable.
- `[app]` A progress bar always carries its number: "72%, 43 days left".

## Reflex

**Looks a model reaches for.** If someone could guess the look from the product
category alone, rework it. Brand rules the user gave (logo colours, brand fonts) win:
a look that comes from the brand is not a finding, and the reviewer does not ask for
a reason. The concept still has to differ in everything the brand does not fix. The
four most common:
- `[all]` Warm cream paper with a high-contrast serif and a terracotta accent.
- `[all]` Near-black with one neon accent and a glow.
- `[all]` Editorial hairlines with an italic serif display and tiny mono labels.
- `[all]` Flat saturated fills with black boxes and hard offset shadows (fine in a deliberately playful theme such as Confetti).

**Colour and surface**
- `[all]` Glow, aurora, mesh gradients, coloured shadows, or a radial spotlight behind the hero.
- `[all]` Glass and background blur as decoration (fine for a small control floating over an image).
- `[all]` Pure grey neutrals with no tint when the concept has an anchor hue.
- `[all]` The accent on every chip, date and keyword; in a restrained theme the accent stays under about 5% of a screen.
- `[all]` Framework default colours (Tailwind indigo-500 and friends) used as the brand.
- `[all]` Grey text on a coloured background; tint it from the background instead (A17).
- `[all]` The same hairline border plus wide soft shadow on every card in a row.
- `[all]` Grid, dot or stripe patterns behind content that is not a map, canvas or blueprint.

**Type**
- `[all]` A reflex face as the display face: Inter, Roboto, Arial, Open Sans, Poppins, Montserrat, Lato, Space Grotesk, Plus Jakarta Sans, DM Sans, Geist, or the system stack (A1). Allowed with a concept-specific reason; Inter and the system stack stay fine for app body text.
- `[all]` More than 2 typefaces (3 when one is a mono for data).
- `[all]` Mono used as costume for labels and meta that are not code, ids or figures.
- `[all]` Heading and body sizes less than 1.25x apart at every step; a flat hierarchy.
- `[all]` Body lines longer than about 75 characters or shorter than 45.

**Layout**
- `[landing]` The template page: centred hero, three equal icon-above-heading cards, a call-to-action band, a four-column footer (A3).
- `[all]` Identical card grids, icons in rounded coloured tiles, pill badges on everything, the same chip on every item.
- `[all]` A big-number "hero metric" block with small labels and supporting stats, when the figures are not the point.
- `[all]` Section numbers (01, 02, 03) on things that are not a sequence.
- `[landing]` Every section separated the same way, every gap the same size; space above a heading not larger than the space below it.
- `[landing]` A strip of three or four figures under the hero, or a logo wall, without real figures and logos.
- `[landing]` Newsletter sign-up as the last section of a page whose job is not subscribing.
- `[all]` One fact repeated in 4 or more places; a section that ends by restating its heading.
- `[all]` A modal used for a task that does not need to stop the user or hold their focus (A15).
- `[all]` Decoration text: rotated vertical words, scroll cues, a BETA pill in the hero, a mono strip of fake metadata.

**Motion**
- `[all]` The same hover lift on every card; more than one hover effect per element; a hover that moves the element under the pointer.
- `[all]` Bounce or overshoot easing outside a playful concept's one rare moment.
- `[all]` A fade-and-rise on every section, or a stagger on something opened many times a day.
- `[all]` A celebration toast for a result already visible on screen.
- `[all]` Missing `:active` or `:disabled` states.

**Copy**
- `[all]` Rival test: put the nearest competitor's name on the main heading. If it still reads true, it says nothing; rewrite it with a fact only this product has. Words the brief or the user fixed (a headline, a button label, a product name) are never rewritten: the finding then goes to the user as a suggestion, and the concept keeps their words.
- `[all]` Process talk ("This section shows", "Below you'll find").
- `[all]` Virtue words about the product itself: honest, thoughtful, simply, genuinely, truly, carefully.
- `[all]` Headings that are category labels: Features, Our story, Why us, Solutions.
- `[all]` Default cast names (Priya, Marcus, Elara, Nimbus, Apex, Zenith) instead of names that fit the market.

## Finish

- `[all]` Straight quotes where curly ones belong; three dots instead of an ellipsis.
- `[all]` Headings without `text-wrap: balance`; one-word last lines in paragraphs.
- `[all]` Changing figures without `tabular-nums`.
- `[all]` Two filled buttons side by side.
- `[all]` Selection colour, caret and scrollbars left at browser defaults in a strongly themed concept.
- `[app]` Worst-case data not tried: a long name, a one-letter name, a long unbreakable email, counts of 0, 1 and 1,284, an empty list, a 30% longer translation, a missing avatar. Text columns in flex or grid without `min-width: 0`.

## Two quick tests

- **Squint:** blur the screenshot. The most important thing on each screen should still be the first thing seen, and groups should still read as groups.
- **Delete the picture:** imagine the main image gone. When the screen's message does not change, that image was only decoration.

## First-screen review

At step 6, before the rest of a concept is built:

1. Capture the first screen at the platform's main check width (1280x800 and 390x844
   for a landing page, the phone or window size for an app), after the entrance ends.
2. Dispatch a fresh subagent with only the capture, the concept card, `picks.md` and
   this file. It answers `ship` or `fix` first, then at most 5 findings, worst first:
   - Does the first screen say what this is, for whom, and the one action, in the user's own words?
   - Does the main visual show the product's signature idea working, not a picture beside a headline?
   - Is anything on it a Floor or Reflex item?
   - Is it as finished as the liked references, or does it look like a draft of them?
   - Would someone who saw only this screen remember one specific thing?
3. Fix, then build the rest. One round; what stays open goes to step 7.

## The review

1. The builder captures every prototyped screen of every concept, including sheets,
   dialogs and empty, loading and error states, at the platform's check widths (SKILL.md,
   platform table), after entrances finish or with reduced motion on. Screenshots go to
   `.preview/konsep/<name>/review/`.
2. The builder dispatches a fresh subagent, one per concept or one for all, with only
   these inputs: the screenshot folder, the prototype's HTML path, the concept's card,
   `.preview/references/picks.md`, this file, and `critique.md` (the scored critique it
   reports beside its verdict). Never the build conversation, the
   builder's notes on what it meant, or other concepts' findings. The prompt says:
   read `slop-check.md` and follow *The review*.
3. The reviewer reads the screenshots before the code, and answers with one word
   first: `ship`, `fix`, or `recapture` (the screenshots do not show enough to judge).
   Then at most 8 findings, worst first, one line each:
   `<tier> <rule or plain defect> — <where> — <what to change>`. Then two lines: the
   rival test result for the main heading, and whether the concept still carries what
   the user liked in `picks.md`. The reviewer never edits files.
4. The builder fixes, recaptures, and runs one more review the same way. At most 2
   rounds. Anything still open, and every Reflex item kept with its reason, goes in the
   step 8 report.
5. Where no subagent can be dispatched, the builder runs the review itself after
   rereading only these inputs, and the report says "slop check: same session".
