# Built-in themes

Twenty-four starting materials for concepts. A theme is a material: paper, ink, type,
surfaces, controls, motion character and voice. It never says what a page contains or
in what order; the concept decides that. Themes are dealt at step 3 (`references.md`)
and shown to the user next to real references. A concept may start from one, mix two,
or leave them all.

Preview any theme at `preview.html?theme=<file name without .md>`, served from this
folder. The preview uses only the theme's tokens, so it shows the material, not a
finished page. Without more, it shows a sample invoice screen; on a pick page, pass the
product's own words in the link (`references.md` lists the parameters).

## Format

Each theme is one `.md` file:

1. Front matter, one line each:
   - `name`
   - `genre`: modern-minimal, editorial, atmospheric, or playful
   - `paper`: light, mid, or dark
   - `display`: the type class, then the face (classes: grotesk, geometric, humanist, condensed, mono, slab, serif, high-contrast-serif, rounded, display-heavy)
   - `body`: the body face
   - `accent`: what the accent is for, in a few words
   - `posture`: restrained (accent under 5% of a screen), committed (one colour carries 30 to 60%), full-palette, or drenched (the page is the colour)
   - `motion`: still, severe, brisk, or calm (see `../motion.md`)
   - `keywords`: words that route a brief to it, used when dealing
   - `fonts`: the Google Fonts `family=` value, so the preview can load them
2. **Feel**: one short paragraph, and what it is not.
3. **Tokens**: one `css` block with a `:root` rule and nothing else. Names are fixed so
   every theme previews the same way:
   `--paper`, `--paper-2`, `--paper-3` (page and two raised surfaces), `--ink`,
   `--ink-2`, `--muted`, `--rule`, `--accent`, `--accent-ink` (text on the accent),
   `--focus`, `--font-display`,
   `--font-body`, `--font-data`, `--radius-card`, `--radius-control`, `--hairline`,
   `--shadow`, `--display-weight`, `--display-tracking`.
4. **Type**, **Surfaces**, **Controls**, **Voice**: a few lines each.
5. **Do not**: 3 to 5 things this theme must never do.

Rules every theme keeps: `--ink` and `--muted` on `--paper` and `--paper-2` reach 4.5:1,
`--accent-ink` on `--accent` reaches 4.5:1, `--focus` reaches 3:1 on `--paper`. Fonts
are linked from Google Fonts, never bundled. A face on the reflex list in
`../slop-check.md` is used only with the reason written in the theme.

## Adding a theme

Copy the closest file, change every token, check the contrast rules above by
calculation, and give it keywords that no other theme already owns. A theme that
differs from another only in its accent colour is not a new theme.
