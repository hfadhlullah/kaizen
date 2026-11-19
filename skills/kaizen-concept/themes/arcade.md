---
name: Arcade
genre: playful
paper: dark
display: display-heavy, Press Start 2P
body: Pixelify Sans
accent: a lit-up cyan for the live cursor, score and the one start button
posture: committed
motion: brisk
keywords: game, arcade, pixel, retro, indie, 8-bit, jam, esports, quest, level, console, play
fonts: Press+Start+2P&family=Pixelify+Sans:wght@400;600
---

# Arcade

A dark purple cabinet screen with chunky pixel type and square, stepped edges. Headings feel like a title screen and the rest stays readable. It is not neon cyberpunk: no glow, no scanline overlay, no purple-to-pink gradients.

```css
:root {
  --paper: #14122a;
  --paper-2: #1d1a3d;
  --paper-3: #2a2655;
  --ink: #f5f3ff;
  --ink-2: #d6d2f0;
  --muted: #b3aedc;
  --rule: #4a4590;
  --accent: #3ee6d4;
  --accent-ink: #0b0a1e;
  --focus: #ffd23f;
  --font-display: 'Press Start 2P', monospace;
  --font-body: 'Pixelify Sans', system-ui, sans-serif;
  --font-data: 'Pixelify Sans', ui-monospace, monospace;
  --radius-card: 0;
  --radius-control: 0;
  --hairline: 2px;
  --shadow: 4px 4px 0 #07061a;
  --display-weight: 400;
  --display-tracking: 0;
}
```

**Type.** Pixel face for headings only, in short lines of one to four words at a size where its grid is whole numbers (16, 24, 32px). Body in the pixel-sans at 18px and 1.5. Never set the pixel face in a paragraph.

**Surfaces.** Flat panels with a 2px stepped border and a hard offset shadow. Corners are square; a notch cut from a corner is allowed once per page. Pictures keep crisp edges with image-rendering set to pixelated, and use only real game art.

**Controls.** Buttons are cyan with dark text and a 2px border. Pressed, they drop 2px. Focus is a yellow 3px outline. Menus are lists with a visible selected row marker.

**Voice.** Short and playful, second person, game vocabulary only when it is literal: levels, saves, players.

**Do not.**
- glow, bloom or scanline overlays
- the pixel face in body text
- blurred or smoothed pixel art
- fake health bars and scores as decoration
