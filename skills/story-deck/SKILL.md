---
name: story-deck
description: Build a cinematic, minimalist storytelling pitch deck (A5 landscape .pptx) in the style of a senior agency — story first, problem, a single "what if" question, then the product reveal and feature scenes, ending in a demo CTA. Dark ink + gold, Playfair Display + Inter, full-bleed graded photos. Use when the user asks for a pitch deck / sales deck / product showcase deck "that tells a story", "cinematic", or a new deck for a product or audience in that style. Do NOT use for editing an existing .pptx, plain bullet decks, or data reports — use the pptx skill for those.
---

# Story deck

A deck that tells a story before it sells. Worked example: [`examples/build-example.js`](examples/build-example.js)
(every helper on a fictional product, no images needed).

Read before building:
- [`references/story-arc.md`](references/story-arc.md) — the acts, slide recipes, copy rules, layout facts.
- [`references/rules.md`](references/rules.md) — truth, images, fonts, files, QA. Every rule there cost a redo.

If the Anthropic `pptx` skill is available, load it once (pptxgenjs gotchas, validator); `qa.sh` works without it.
Run `scripts/check.sh` first on a new machine.

## Workflow

1. **Brainstorm first.** Propose 2–3 story concepts + an outline (one line per slide) and
   ask: audience, language, data available, photos, the CTA. Build only after the outline is agreed.
2. **Deck folder:** `~/.kaizen/decks/<slug>/` — everything a deck needs and produces lives there
   (never in the user's project folders). Shared dependencies live once in `~/.kaizen/decks/`:
   `node_modules` (pptxgenjs, resolved upward by Node) and `.venv` (Pillow, defusedxml, lxml,
   fonttools, qrcode). First time on a machine:
   `cd ~/.kaizen/decks && npm init -y && npm i pptxgenjs && python3 -m venv .venv && .venv/bin/pip install pillow defusedxml lxml fonttools "qrcode[pil]"`.
   Copy in `scripts/kit.js`, `scripts/prep_images.py`, `scripts/qa.sh`.
3. **Research the truth.** Features from the product repos (shipped only — one sub-agent per
   repo when there are several, if your agent has sub-agents). Stats from official sources with citations.
4. **Photos.** Find on Unsplash with a web-fetch tool (or ask the user for photos), download to `img/`, contact-sheet, choose.
   Write `plan.json` (backgrounds + panels), run `python3 prep_images.py plan.json` → `bg/`.
5. **Fonts.** Run `scripts/install_fonts.py` once per machine (static instances; see rules.md).
6. **Write `build-<name>.js`** with `kit.js`:

   ```js
   const { makeDeck } = require("./kit");
   const d = makeDeck("Deck title", { logo: "logo.png", logoRatio: 199 / 880 }); // branding optional
   d.story("s01", { kick, title, sub, notes, credit, top });  // photo story beat
   d.pause(line, sub, notes);                                  // black silence slide
   d.question(line, notes);                                    // gold "what if" slide
   d.reveal(name, tagline, line, notes);                       // product name reveal
   d.scene("f03", { kick, title, features: [[name, desc]], notes, credit, shot, shotRatio }); // shot = UI screenshot, framed right
   d.cards(kick, title, [[label, name, desc] x3], notes, footnote);
   d.cta("f16", { title, sub, facts, notes, credit, contact, site, qr }); // qr: PNG path (make with python qrcode), else a [QR] box
   d.pres.writeFile({ fileName: "Deck.pptx" }).then(console.log);
   ```

   Branding options on `makeDeck(title, brand)`: `INK, CREAM, MUTED, GOLD, GOLD_BG, cardBg`
   (hex, no `#`), `SERIF, SANS` (font names), `logo` (light-on-dark PNG path; none = no logo),
   `logoRatio` (height/width). Defaults are the neutral ink + gold look with no logo.
   For anything the helpers do not cover (triptych, recap timeline, stat rows) use
   `d.slide()`, `d.kicker()`, `d.headline()`, `d.body()` and see build.js / build-features.js
   in the reference project.
7. **QA:** `./qa.sh build-<name>.js`, look at every printed sheet (or send them to the user), fix, repeat. Clean `qa/` after.
8. **Report:** file path, the story in one line per slide, every placeholder left, every
   claim the user must verify, and what was deliberately left out.

## Agent notes (Claude Code, Codex, Gemini CLI, OpenCode, Cursor…)
Steps name capabilities, not tools. Where your agent lacks one:
- **web fetch** (finding stock photos, sources): ask the user for photos/links instead.
- **viewing images** (checking contact sheets / frames): send the image paths to the user and ask them to look.
- **sub-agents** (reading several repos at once): read them one after another.
- **structured questions**: ask in plain text with numbered options.
