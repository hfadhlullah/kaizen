---
name: Gridline
genre: modern-minimal
paper: light
display: grotesk, Hanken Grotesk
body: Hanken Grotesk
accent: one signal red for the single thing to act on
posture: restrained
motion: severe
keywords: swiss, grid, modernist, poster, studio, architecture, typographic, rational, museum, agency, objective
fonts: Hanken+Grotesk:wght@400;500;700;800&family=IBM+Plex+Mono:wght@400;500
---

# Gridline

A strict modernist sheet: white-grey paper, black type flush left on a visible column grid, and one red used once per screen. Size and position do the work that decoration usually does. It is not a poster for a design school: no rotated type, no oversized numerals as ornament.

```css
:root {
  --paper: #f7f7f5;
  --paper-2: #ffffff;
  --paper-3: #ececea;
  --ink: #111111;
  --ink-2: #2e2e2e;
  --muted: #595959;
  --rule: #111111;
  --accent: #d4271c;
  --accent-ink: #ffffff;
  --focus: #111111;
  --font-display: 'Hanken Grotesk', system-ui, sans-serif;
  --font-body: 'Hanken Grotesk', system-ui, sans-serif;
  --font-data: 'IBM Plex Mono', ui-monospace, monospace;
  --radius-card: 0;
  --radius-control: 0;
  --hairline: 1px;
  --shadow: none;
  --display-weight: 800;
  --display-tracking: -0.03em;
}
```

**Type.** Headings 800, tight, set large against small body so the step between them is at least 2x. Flush left, ragged right, never centred. Body 16px at 1.5. Mono only for figures and codes.

**Surfaces.** Everything sits on a column grid with black hairline rules between rows. No cards, no shadows, no rounding. Raised areas are plain white panels with a rule above.

**Controls.** Square buttons. Primary is black with white text; the red button appears once per screen and means the main action. Inputs are an underline, 2px at focus.

**Voice.** Neutral and exact, in short declaratives. States the fact, the date, the place.

**Do not.**
- rounded corners or soft shadows
- red as a background field or on more than one thing at a time
- centred headings
- decorative grid lines drawn behind content
