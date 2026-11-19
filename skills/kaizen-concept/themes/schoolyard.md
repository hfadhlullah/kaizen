---
name: Schoolyard
genre: playful
paper: light
display: rounded, Fredoka
body: Nunito
accent: sunny orange for the next lesson, with a family of bright tints for subjects
posture: full-palette
motion: brisk
keywords: kids, children, education, school, learning, classroom, parents, teacher, lessons, homework, early years, tutoring
fonts: Fredoka:wght@400;500;600&family=Nunito:wght@400;600;700
---

# Schoolyard

Warm, round and bright, built for a child who is learning to read and an adult who is checking. Big targets, big letters, friendly colours per subject. It is not a toy shop: no mascots on every screen, no confetti on every tap.

```css
:root {
  --paper: #fffaf2;
  --paper-2: #ffffff;
  --paper-3: #ffeed6;
  --ink: #25211c;
  --ink-2: #3d372f;
  --muted: #5c5448;
  --rule: #f0d9b5;
  --accent: #c4510a;
  --accent-ink: #ffffff;
  --focus: #1d5fd1;
  --font-display: 'Fredoka', system-ui, sans-serif;
  --font-body: 'Nunito', system-ui, sans-serif;
  --font-data: 'Nunito', ui-monospace, sans-serif;
  --radius-card: 20px;
  --radius-control: 14px;
  --hairline: 2px;
  --shadow: 0 4px 0 #f0d9b5;
  --display-weight: 600;
  --display-tracking: 0;
}
```

**Type.** Headings in the rounded face at 600, sentence case. Body 18px at 1.6. Instructions to a child are one short sentence, with the word and a picture together. Numbers in the body face.

**Surfaces.** Soft rounded panels with a 2px tinted border and a flat shadow beneath, like a block. Each subject owns one tint and one icon colour, used on its own screens only. Real pictures of real classroom things where the user has them.

**Controls.** Buttons are tall (56px) and rounded, orange with white text, with a pressed state that sinks the shadow. Answers are large tiles, never tiny radio buttons. Focus is a thick blue outline.

**Voice.** Encouraging and concrete: names the thing done and the next step. Never scolds, never shows a score as a judgement.

**Do not.**
- cartoon mascots that talk on every screen
- rewards and stars for tasks with no effort
- timers that panic a child
- small text in tinted colour on tinted panels
