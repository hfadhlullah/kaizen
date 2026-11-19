---
name: Civic
genre: modern-minimal
paper: light
display: serif, Merriweather
body: Source Sans 3
accent: a deep civic blue for links and the main service action
posture: restrained
motion: still
keywords: government, public, council, service, forms, municipal, ministry, benefits, citizen, accessibility, statutory, health service
fonts: Merriweather:wght@400;700&family=Source+Sans+3:wght@400;600;700
---

# Civic

A public service page that is plain on purpose: white paper, blue links, a serif heading, large text and nothing clever. Every person must be able to use it on the worst phone with the worst eyesight. It is not a corporate site in government colours: no hero art, no slogans.

```css
:root {
  --paper: #ffffff;
  --paper-2: #f3f5f7;
  --paper-3: #e6eaee;
  --ink: #14202b;
  --ink-2: #2c3b49;
  --muted: #495866;
  --rule: #b7c0c9;
  --accent: #1b4f8f;
  --accent-ink: #ffffff;
  --focus: #e07a00;
  --font-display: 'Merriweather', Georgia, serif;
  --font-body: 'Source Sans 3', system-ui, sans-serif;
  --font-data: 'Source Sans 3', system-ui, sans-serif;
  --radius-card: 4px;
  --radius-control: 4px;
  --hairline: 1px;
  --shadow: none;
  --display-weight: 700;
  --display-tracking: 0;
}
```

**Type.** Headings in the serif at 700, sentence case, one level per question. Body 19px at 1.6 in the sans. Never smaller than 16px. Lines hold 60 to 70 characters. Numbers and dates are written in full.

**Surfaces.** White paper with grey panels for notices. A notice has a full border and a label, never only a colour. No shadows, no images unless they carry information.

**Controls.** Primary button is solid blue with a 48px minimum height. Focus is a thick orange outline plus a dark underline that appears at once. Forms ask one question per screen where the task is long, with errors summarised at the top and repeated at the field.

**Voice.** Plain words at a school-age reading level. Says what to do, what it costs, how long it takes, and what happens next.

**Do not.**
- promotional language or taglines
- colour as the only sign of an error or a status
- dropdowns for fewer than five choices
- time-limited sessions with no warning
