---
name: Broadsheet
genre: editorial
paper: light
display: condensed, Bricolage Grotesque Condensed
body: Source Serif 4
accent: one green for links and the current section
posture: restrained
motion: still
keywords: publishing, magazine, news, blog, newsletter, content, reading, journalism, media, longform
fonts: Bricolage+Grotesque:opsz,wdth,wght@12..96,75,700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600
---

# Broadsheet

Uncoated white stock, heavy ink rules, condensed headlines over a readable serif. Reading is the product. It is not the generic editorial template: no italic serif hero, no tiny mono labels.

```css
:root {
  --paper: #fdfdfb;
  --paper-2: #ffffff;
  --paper-3: #f1f0eb;
  --ink: #111111;
  --ink-2: #2e2e2e;
  --muted: #595959;
  --rule: #111111;
  --accent: #0b6b3a;
  --accent-ink: #ffffff;
  --focus: #0b6b3a;
  --font-display: 'Bricolage Grotesque', 'Arial Narrow', sans-serif;
  --font-body: 'Source Serif 4', Georgia, serif;
  --font-data: ui-monospace, monospace;
  --radius-card: 0px;
  --radius-control: 2px;
  --hairline: 2px;
  --shadow: none;
  --display-weight: 700;
  --display-tracking: -0.01em;
}
```

**Type.** Condensed headlines at 700, serif body at 18px with a 66ch measure, old-style figures in text.

**Surfaces.** No cards. Columns separated by heavy rules and white space.

**Controls.** Text links underlined; one ink button for subscribe.

**Voice.** Plain reporting voice. Headlines say what happened.

**Do not.**
- cards around articles
- italic display headlines
- tracked caps labels
- a second accent
