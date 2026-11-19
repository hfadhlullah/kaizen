---
name: Signal
genre: modern-minimal
paper: light
display: mono, Chivo Mono
body: Chivo
accent: cobalt for what is live right now
posture: restrained
motion: brisk
keywords: utility, transit, logistics, tracking, status, internal tool, field, operations, schedule, live
fonts: Chivo+Mono:wght@400;500;700&family=Chivo:wght@400;500;700
---

# Signal

A utilitarian board where the state of things is the content. Cool grey, square 2px ink borders, mono labels for times and codes. It is not retro-terminal: light paper, no scanlines.

```css
:root {
  --paper: #eef0f2;
  --paper-2: #ffffff;
  --paper-3: #dfe3e7;
  --ink: #101418;
  --ink-2: #2b3138;
  --muted: #545c66;
  --rule: #101418;
  --accent: #1d4ed8;
  --accent-ink: #ffffff;
  --focus: #1d4ed8;
  --font-display: 'Chivo Mono', ui-monospace, monospace;
  --font-body: 'Chivo', system-ui, sans-serif;
  --font-data: 'Chivo Mono', ui-monospace, monospace;
  --radius-card: 0px;
  --radius-control: 0px;
  --hairline: 2px;
  --shadow: none;
  --display-weight: 700;
  --display-tracking: -0.02em;
}
```

**Type.** Mono headings because codes, times and ids are the product's language. Body in Chivo for reading.

**Surfaces.** 2px ink borders, square corners, no shadows. Live items get a cobalt block, not a dot.

**Controls.** Square buttons with ink borders, 44px tall, labels as verbs.

**Voice.** Telegraphic and literal: "Bus 7A, 4 min, platform 2".

**Do not.**
- pulsing live dots
- rounded corners
- a second accent
- decorative mono strips
