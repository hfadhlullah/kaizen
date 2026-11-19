---
name: Newsprint
genre: editorial
paper: mid
display: serif, Old Standard TT
body: PT Serif
accent: a single editorial red for the lead story and corrections
posture: restrained
motion: still
keywords: newspaper, news, journalism, gazette, press, local, investigation, report, daily, archive, civic, long read
fonts: Old+Standard+TT:wght@400;700&family=PT+Serif:wght@400;700&family=Courier+Prime:wght@400;700
---

# Newsprint

Grey-beige stock, black ink, columns of dense serif text and heavy rules between stories. It rewards reading and lets a front page show many things at once. It is not a cosy magazine: no whitespace luxury, no pull-quote theatre, no photo-led spreads.

```css
:root {
  --paper: #e9e4d6;
  --paper-2: #f3efe3;
  --paper-3: #ddd7c5;
  --ink: #1b1a17;
  --ink-2: #35332e;
  --muted: #55524a;
  --rule: #3a372f;
  --accent: #a6191b;
  --accent-ink: #ffffff;
  --focus: #a6191b;
  --font-display: 'Old Standard TT', 'Times New Roman', serif;
  --font-body: 'PT Serif', Georgia, serif;
  --font-data: 'Courier Prime', ui-monospace, monospace;
  --radius-card: 0;
  --radius-control: 0;
  --hairline: 1px;
  --shadow: none;
  --display-weight: 700;
  --display-tracking: -0.01em;
}
```

**Type.** Headlines in the old-style serif at 700, sized by importance and set in sentence case. Body 17px at 1.55 in the text serif, justified with hyphenation on wide columns only. Datelines and bylines in the body face, a step smaller. Figures in mono.

**Surfaces.** Paper is a mid warm grey. Stories are separated by a 1px rule and a double rule under the masthead. The raised surface is a slightly lighter panel for sidebars, with no shadow.

**Controls.** Links are underlined. Buttons are rectangles with a black border; the one filled button is red. Nothing animates.

**Voice.** Plain reporting: who, what, when, where. Attributes every claim. Corrections are printed in red where the story ran.

**Do not.**
- photographs on a grey filter used as a style
- more than one red element per story
- centred body text
- drop caps on every article
