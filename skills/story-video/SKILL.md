---
name: story-video
description: Turn whatever a user brings for any product — a prompt, a story, product photos, app screenshots, a deck (.pptx/.pdf), footage — into a publish-ready video (MP4 + SRT + thumbnail + credits) in a chosen style (cinematic-drama, promo-booth, fun-energetic, viral-social 9:16) with the product's own brand, narration in the user's language with emotional direction, word-synced captions, sound design, music, logo reveal and loudness mastering; then revise it on request. Use for promo / launch / opener / social / viral / explainer videos or "turn this deck into a video". Not for hand-editing an existing video timeline.
---

# Story video

Product-agnostic. A film is data: `~/.kaizen/videos/<slug>/film.json` (storyboard + brand) + `lines.json`
(narration with emotion tags) + `words.json` (word timings, generated) + a preset.
Worked example: [`examples/sample-film/`](examples/sample-film/) (fictional product, no images needed).
Run `scripts/check.sh` first on a new machine.

Read before producing:
- [`references/production.md`](references/production.md) — what makes a video publish-grade; QA list.
- [`references/presets.md`](references/presets.md) — styles, when to use each, adding one.
- [`references/script.md`](references/script.md) — **how to write the narration** (a told story, not slide text).
- [`references/revisions.md`](references/revisions.md) — how user revisions are applied and versioned.
- [`references/licensing.md`](references/licensing.md) — **before anything is published**.

## 0. Voice — ask first
Ask: "Do you have an ElevenLabs account? Which plan?" Then:
- **Paid ElevenLabs** (Starter+): best and commercially licensed. Use a **native speaker of the
  narration language** from the voice library (e.g. Indonesian: search `shared-voices?language=id`,
  add it, let the user pick from 3 samples). Non-native voices sound synthetic — this is the
  biggest single factor in how natural the video sounds.
- **Free ElevenLabs**: premade voices only (non-native for most languages) and **no commercial use**;
  fine for drafts and internal review. Offer samples (v3 with `stability: 0` sounds most natural).
- **No ElevenLabs**: free Microsoft neural voices via edge-tts (`pip install edge-tts`), set
  `"voiceProvider": "edge"` (automatic when no key). No emotion control; usable for drafts.
- Or the user records the narration: write the script with timings, cut the film to their audio.
Set `voiceProvider` / `voice` / `edgeVoice` in film.json accordingly.

## Where things live
- **Film workspace:** `~/.kaizen/videos/<slug>/` (one home for every video, whatever the product; override `STORY_VIDEO_HOME`) — `inputs/` (the user's material), generated
  assets (photos, voice `vNN.mp3`, `music.mp3`), `lines.json`, `film.json`, `words.json`,
  `REVISIONS.md`, `out/` (deliverables) and `out/previous/` (earlier versions). Nothing is written to the user's project folders.
- **Engine:** `~/.kaizen/story-video/engine/` (Remotion + node_modules + sfx), installed once per machine
  and shared by every project. `scripts/setup.sh <slug>` (run from the project root) installs or updates
  it and creates the film workspace (from any directory). Override with `STORY_VIDEO_ENGINE`.
- Scripts run from the skill: `S=<this skill>/scripts`, every script takes the film dir.

## 1. Intake — whatever the user brings
`$S/setup.sh <slug>`, put the user's material in `~/.kaizen/videos/<slug>/inputs/` sorted as
`photos/`, `screens/`, `footage/`, `logo*.png`, a deck (`*.pptx` / `*.pdf`) and/or `brief.md` (their
prompt or story, verbatim), then `python3 $S/intake.py ~/.kaizen/videos/<slug>`. It crops photos for
16:9 and 9:16, keeps screenshots untouched (records ratios), transcodes footage, renders deck slides +
text to `intake/`, and suggests a brand palette from the logo. Read the deck text, the brief and the
slide images before writing anything.

Missing material is fine: no photos → source candid ones (story-deck rules); no screenshots →
ask for them (product beats need the real product); no story → propose one.

## 2. Brief — ask with options (one round)
Purpose and where it plays · style preset · length · formats · language · voice (from step 0;
ask gender/tone) · music mood · brand (logo, colours, fonts — propose from the
logo palette) · CTA (URL / QR target / contact / event details — never invent them) · claims the
user can back up.

## 3. Treatment — approve before generating
A beat table: time · picture · narration line + emotion tag · on-screen text · SFX/ambience.
Write the narration as one told story (references/script.md) — the user's text is source, not script.
Show the full script as continuous prose too, so the user can judge how it flows. Only claims the material supports. The user approves or edits it; that is revision 0.

## 4. Produce (F = ~/.kaizen/videos/<slug>)
1. `F/film.json`: `preset`, `language` (`id`, `en`, …), `voiceProvider`, `voice`, `stability`,
   `brand` (`palette`, `fonts`), `labels` (on-screen words in that language: `source`, `next`),
   `logo` (light, for dark backgrounds), `logoOnLight`, `qr`, `cta`, `beats` — table below.
   File names in beats are relative to `F`.
2. `F/lines.json` (approved script) → `python3 $S/vo.py F` (or only some lines: `vo.py F "" v04,v07`).
3. Music: `$S/music.sh F "Track"`; offer 3–5 previews when the mood is not settled.
4. QR: `python3 -c "import qrcode; qrcode.make('<url>').save('F/qr.png')"`.
5. Check frames: `$S/still.sh F 16x9 60 400 900`, contact-sheet, look at it (or send it to the user), fix. Delete the check images after.
6. Master each format: `$S/master.sh F <16x9|9x16> <name> <-14|-16> <thumb-second>` → `F/out/`.

## 5. Deliver, then revise
Report files, lengths, loudness, licence status, placeholders, claims to verify, and ask the user
to listen once (the agent cannot hear). Revisions follow `references/revisions.md`: change only
the touched beats/lines, re-render, keep earlier versions in `out/previous/`, log in `REVISIONS.md`.

## Beat kinds

| kind | use | key fields |
|---|---|---|
| `photo` | story beat on a photo | `img, side, kick, title, sub, ambience, sfx` |
| `list` | items arrive one by one with the line | `img, kick, title, items[]` |
| `stat` | numbers count up, source on screen | `stat[{value,suffix,label,source}], title` |
| `black` | silence / pause | `title, sub, hold` |
| `triptych` | three viewpoints | `panels[{img,title,sub}]` |
| `question` | the turn ("what if") | `title` |
| `reveal` | logo wipe-in + tagline | `sub, line` |
| `shot` | real product screenshot, framed | `img, shotRatio, kick, title, sub` |
| `footage` | video clip | `video, kick, title` |
| `cta` | the ask: QR, contacts, URL | `img, hold` + `film.cta` |

Any beat: `vo`, `sfx[]` (whoosh, hit, riser, tick, pop, chime, ping, pings, bell, keyboard) and
`ambience` (amb-morning, amb-classroom, amb-office, amb-night). Add sounds with `scripts/sfx.py` (writes to the shared engine).
Fonts available: Playfair Display, Inter, Fraunces, Montserrat, Poppins, DM Sans, Lora,
Plus Jakarta Sans, Space Grotesk (add more in `engine/Film.tsx` FONTS).

## Distribution
Shipped with kaizen (`skills/story-video` in the kaizen repo).

## Agent notes (Claude Code, Codex, Gemini CLI, OpenCode, Cursor…)
Steps name capabilities, not tools. Where your agent lacks one:
- **web fetch** (finding stock photos, sources): ask the user for photos/links instead.
- **viewing images** (checking contact sheets / frames): send the image paths to the user and ask them to look.
- **sub-agents** (reading several repos at once): read them one after another.
- **structured questions**: ask in plain text with numbered options.
