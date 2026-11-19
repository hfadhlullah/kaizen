---
name: Phosphor
genre: atmospheric
paper: dark
display: mono, JetBrains Mono
body: IBM Plex Sans
accent: warm amber for the prompt, the selection and what just ran
posture: restrained
motion: severe
keywords: cli, terminal, developer, command, open source, tooling, devops, keyboard, shell, sdk
fonts: JetBrains+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;500
---

# Phosphor

Warm charcoal with amber, like an old amber monitor turned into a modern docs page.
Commands and output set in mono, explanations in a plain sans so long reading stays
easy. For tools people drive from the keyboard. It is not a movie hacker screen and
not green-on-black: no scanlines, no glow, no falling characters.

```css
:root {
  --paper: #16130f;
  --paper-2: #1e1a15;
  --paper-3: #29241d;
  --ink: #f1e6d4;
  --ink-2: #d6c8b1;
  --muted: #b3a48c;
  --rule: #3a332a;
  --accent: #f2a93b;
  --accent-ink: #1a1206;
  --focus: #f2a93b;
  --font-display: 'JetBrains Mono', ui-monospace, monospace;
  --font-body: 'IBM Plex Sans', system-ui, sans-serif;
  --font-data: 'JetBrains Mono', ui-monospace, monospace;
  --radius-card: 6px;
  --radius-control: 6px;
  --hairline: 1px;
  --shadow: none;
  --display-weight: 600;
  --display-tracking: -0.02em;
}
```

**Type.** Mono for headings, commands, ids and output, because that is the product's
language. Body in IBM Plex Sans at 16px and 1.6 for anything a person reads as prose.

**Surfaces.** Panels as warmer steps of the charcoal. Every command in a real block with
a copy button; output shown as it prints, never retyped by hand.

**Controls.** Keyboard first: each action shows its shortcut beside the label. The amber
marks the current prompt or selection, never decoration.

**Voice.** Literal and short: the command, what it does, what it printed, what to run
next.

**Do not.**
- scanlines, glow or flicker
- amber on large areas or on body text
- a caret blinking without end
- typing animations that hide the real command
- mono for paragraphs of explanation
