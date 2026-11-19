---
name: Atelier
genre: editorial
paper: light
display: high-contrast-serif, Bodoni Moda
body: Inter Tight
accent: ink blue for one signal per screen
posture: restrained
motion: calm
keywords: luxury, fashion, studio, portfolio, architecture, gallery, jewellery, premium, craft, boutique
fonts: Bodoni+Moda:opsz,wght@6..96,400;6..96,500&family=Inter+Tight:wght@400;500
---

# Atelier

Oat paper, razor-thin Bodoni, 1px rules, wide space. The work shown is the brightest thing. It is not cream + serif + terracotta: cool oat, ink blue, no warm orange.

```css
:root {
  --paper: #f3f1ec;
  --paper-2: #fbfaf7;
  --paper-3: #e7e3da;
  --ink: #16161a;
  --ink-2: #33333a;
  --muted: #5d5d64;
  --rule: #cfcac0;
  --accent: #1f3a8a;
  --accent-ink: #ffffff;
  --focus: #1f3a8a;
  --font-display: 'Bodoni Moda', Didot, serif;
  --font-body: 'Inter Tight', system-ui, sans-serif;
  --font-data: ui-monospace, monospace;
  --radius-card: 0px;
  --radius-control: 0px;
  --hairline: 1px;
  --shadow: none;
  --display-weight: 400;
  --display-tracking: -0.01em;
}
```

**Type.** Bodoni large and light, never under 32px. Inter Tight for small text because Bodoni fails at small sizes (reason for a common face).

**Surfaces.** Full-bleed images of the real work, 1px rules, no boxes.

**Controls.** Text buttons with a thin underline; one bordered button at most.

**Voice.** Few words, no adjectives. Names, materials, places.

**Do not.**
- Bodoni below 32px
- terracotta or warm orange
- shadows
- more than 3 words of hype
