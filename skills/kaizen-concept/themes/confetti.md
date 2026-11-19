---
name: Confetti
genre: playful
paper: light
display: display-heavy, Bowlby One
body: Rubik
accent: hot pink, lime and ink as fills
posture: full-palette
motion: brisk
keywords: kids, games, community, social, events, consumer, fun, gen-z, quiz, rewards
fonts: Bowlby+One&family=Rubik:wght@400;500;700
---

# Confetti

Off-white with hard offset shadows and flat fills in pink, lime and ink. Loud on purpose, but every colour still has a job. It is not chaos: one grid, one radius, shadows always the same offset.

```css
:root {
  --paper: #fffdf7;
  --paper-2: #ffffff;
  --paper-3: #f4f0e4;
  --ink: #141414;
  --ink-2: #2c2c2c;
  --muted: #555555;
  --rule: #141414;
  --accent: #d6246e;
  --accent-ink: #ffffff;
  --focus: #141414;
  --font-display: 'Bowlby One', Impact, sans-serif;
  --font-body: 'Rubik', system-ui, sans-serif;
  --font-data: ui-monospace, monospace;
  --radius-card: 14px;
  --radius-control: 12px;
  --hairline: 2px;
  --shadow: 4px 4px 0 #141414;
  --display-weight: 400;
  --display-tracking: 0em;
}
```

**Type.** Bowlby for short headings only (3 words or fewer), Rubik for everything else.

**Surfaces.** Flat fills with 2px ink borders and a 4px hard shadow; lime #c6f432 as a fill behind ink text only.

**Controls.** Chunky buttons that press down 2px on click, removing the shadow.

**Voice.** Playful and short, never sarcastic. Celebrates real wins only.

**Do not.**
- soft blurred shadows
- lime text on white
- more than 3 fill colours
- confetti animation on every action
