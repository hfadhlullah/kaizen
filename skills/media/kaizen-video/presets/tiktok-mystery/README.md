# TikTok mystery preset

A 1080×1920 HyperFrames style for talking-head explainers with a mystery tone. It was modeled on a mystery-explainer reference video.

## Look and motion

- **Cold open plus hook:** an optional replay of one strong line opens the video. The two-line hook title (white and red, with a white-box subtitle) sits above the speaker's face, which stays unblurred, while captions run underneath.
- **Grade:** muted cold teal tint, light vignette, moving film grain, and a few light flickers.
- **Jump cuts:** framing alternates between 1.0× and a 1.14× punch-in at every cut, with a slow push-in inside each segment.
- **Captions:** 3-word chunks in a karaoke fill. Each word is grey before it is spoken, sweeps red left to right over exactly its spoken duration (starting one frame early), and turns white once the next word starts. Every word follows the same rule.
- **Cards**, which all enter with a camera-capture move (viewfinder corners, REC tag, a focus box pulling in, shutter blades snapping, and a shutter click). The speaker blurs and darkens behind each card.
  - `title`: big word with a white-box subtitle and an optional photo above.
  - `case`: a typewriter case file with an optional pinned photo and a red stamp that slams on with a stamp sound.
  - `photo`: a floating rounded photo with a label, slowly zooming.
  - `item`: a checklist entry. A typewritten "KEMUNGKINAN:" header comes first. Each "?" box flickers on like a failing bulb, glows and pulses, the item jolts with a glitch, and its text types out letter by letter with a typewriter-and-gong `reveal` sound. The list leaves at the first jump cut after its last item, at most 6 s later.
  - `end`: one huge red word per line, slammed in one after another, followed by a flash and a camera shake over a near-black screen. It lands on the `ending` sting, a reversed gong swelling into the gong hit.
- **Layout:** content is centered with equal side margins (captions 110 px, cards 125 px). Titles shrink to fit 840 px. This keeps everything mostly clear of TikTok's side buttons.

## Audio

- **Music:** `assets/music/lights.mp3` (Rafael Krux, CC BY 4.0) or `investigations.mp3` (Kevin MacLeod, CC BY 4.0). The music is carved around the voice with `tools/carve.mjs` from hyperframes-audio, so it dips only in the frequency bands the voice uses.
- **Voice:** `afftdn` denoise and a de-esser during source processing, then a rumble cut, compressor, gain and a true-peak ceiling at −1.5 dBTP inside the composition. Results land at about −16 LUFS.
- **Sound effects** in `assets/sfx/`:
  - Automatic: `shutter` (every card), `stamp`, `reveal` (checklist items) and `ending`.
  - Usable as reactions in the config: `heart`, `clock`, `projector`, `whoosh`, `ding`.

## New video

1. Put the footage in `videos/<name>/raw/` and transcribe it (see the workflow in the skill's `SKILL.md`). If you cut it, keep `transcript/render-plan.json`.
2. Copy the skill's `examples/config.json` to `videos/<name>/config.json` and put card images in `videos/<name>/images/`.
   - Beats and reactions anchor to the first word starting with `word`, at or after `after` seconds of the cut.
3. From the project folder, run `python3 <skill>/scripts/make_tiktok.py videos/<name> --render`. The output always lands at `output/<name>/tiktok-mystery/<name>.mp4` with `CREDITS.txt`, and a revision replaces it. For a live preview, run `cd videos/<name>/tiktok && npm run dev`.

## Config keys

| Key | Meaning |
|---|---|
| `video`, `words`, `plan` | Input cut, WhisperX words, and an optional render plan (the cut's source ranges) |
| `hook` | `line1`, `line2`, `sub` |
| `cold_open` | `{"from": word, "after": s, "to": word}` replays that line first; everything else shifts automatically |
| `fix` | Caption spelling corrections, e.g. `{"Mainan": "Mainland"}` |
| `beats` | Cards: `title` / `case` / `photo` / `item` / `end` with their text and `img` |
| `reactions` | `{"sfx", "word", "after", "offset", "volume"}` |
| `music`, `music_volume` | Music bed id and its level (default 0.32) |
| `tail` | Seconds the ending card holds after the footage ends |
| `crf` | Encoder quality (default 23, about 50–60 MB for 2 minutes); lower is sharper and bigger |

## Notes

- Source processing (cold open, lanczos upscale with light unsharp, dialogue cleanup) is cached by `tiktok/source.key`. `source.mp4` is always written as a new file. Never hard-link it to the input: an earlier version did, and overwriting it wiped `work/cut.mp4`.
- Measured WhisperX timing on this footage had a median error of about −12 ms, so no global caption offset is applied.
