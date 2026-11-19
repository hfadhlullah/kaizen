---
name: Graphite
genre: modern-minimal
paper: dark
display: grotesk, Geist
body: Geist
accent: amber for what a person did, blue for what the system did
posture: restrained
motion: severe
keywords: developer, devtools, ops, logs, monitoring, infrastructure, api, audit, dark, technical
fonts: Geist:wght@400;500;600&family=Geist+Mono:wght@400;500
---

# Graphite

Graphite panels in three steps, hairline borders, dense rows. Two signals with fixed jobs: amber marks a human action, blue marks an instrument or the system. It is not neon-on-black: no glow, no gradient, no green hacker text.

```css
:root {
  --paper: #141517;
  --paper-2: #1c1d20;
  --paper-3: #26282c;
  --ink: #ececec;
  --ink-2: #c4c6ca;
  --muted: #9a9da3;
  --rule: #2f3237;
  --accent: #f0a43a;
  --accent-ink: #1a1205;
  --focus: #6aa6ff;
  --font-display: 'Geist', system-ui, sans-serif;
  --font-body: 'Geist', system-ui, sans-serif;
  --font-data: 'Geist Mono', ui-monospace, monospace;
  --radius-card: 6px;
  --radius-control: 5px;
  --hairline: 1px;
  --shadow: none;
  --display-weight: 560;
  --display-tracking: -0.01em;
}
```

**Type.** Geist is used for its tight, even width in dense tables (reason for a common face). Mono for ids, times and code only.

**Surfaces.** Three graphite steps for depth, never a shadow. Hairline borders at the rule colour.

**Controls.** Compact 32px controls, keyboard hints shown in mono beside menu items.

**Voice.** Terse and technical. States, counts, durations: "3 failed, retried at 14:02".

**Do not.**
- glow or coloured shadows
- mono for headings or labels as costume
- a third signal colour
- rounded corners above 8px
