---
name: Bolt
genre: playful
paper: light
display: display-heavy, Archivo Black
body: Work Sans
accent: acid yellow as a slab of colour behind what matters
posture: committed
motion: brisk
keywords: brutalist, anti-design, raw, loud, punk, zine, underground, collective, label, streetwear, rebellious
fonts: Archivo+Black&family=Work+Sans:wght@400;600;700&family=IBM+Plex+Mono:wght@400;600
---

# Bolt

Raw on purpose: thick black borders, a hard yellow field, headings that shout, and layouts that look pasted rather than aligned. The roughness is chosen and consistent. It is not a broken page: text stays readable, targets stay large, and nothing overlaps what must be read.

```css
:root {
  --paper: #f1efe6;
  --paper-2: #ffffff;
  --paper-3: #e2dfd2;
  --ink: #0a0a0a;
  --ink-2: #262626;
  --muted: #4d4b45;
  --rule: #0a0a0a;
  --accent: #ffe500;
  --accent-ink: #0a0a0a;
  --focus: #0a0a0a;
  --font-display: 'Archivo Black', Impact, sans-serif;
  --font-body: 'Work Sans', system-ui, sans-serif;
  --font-data: 'IBM Plex Mono', ui-monospace, monospace;
  --radius-card: 0;
  --radius-control: 0;
  --hairline: 3px;
  --shadow: 6px 6px 0 #0a0a0a;
  --display-weight: 400;
  --display-tracking: -0.02em;
}
```

**Type.** Heading face at one size per screen, very large, often in capitals of the heading face only (never small tracked caps). Body 17px at 1.5 in the grotesk. Figures in mono.

**Surfaces.** 3px black borders, flat fills, one hard offset shadow for the raised thing. Blocks may sit a few degrees off true, once or twice per page, never text.

**Controls.** Buttons are yellow with a black border and the offset shadow; pressed, they move into the shadow. Inputs have a thick border and no placeholder as label.

**Voice.** Blunt, short, a little rude to the industry, never to the visitor. Says the price and the date outright.

**Do not.**
- soft shadows or gradients
- tilting body text or form fields
- low-contrast grey text for effect
- the same offset shadow on every element, so it stops meaning raised
