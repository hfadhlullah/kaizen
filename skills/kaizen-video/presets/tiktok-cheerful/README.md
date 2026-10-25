# TikTok cheerful preset (`tiktok-cheerful`)

A 1080×1920 HyperFrames style for talking-head explainers with a warm, upbeat **Sunny Pop Explainer** tone.

## Look and motion

- **Cold open plus hook:** an optional replay of one strong line opens the video. The two-line hook title (cream-white and sun-yellow `#FFD23F` in rounded Fredoka display type, with a sun-yellow pill subtitle) bounces in above the speaker's face while karaoke captions run underneath.
- **Grade:** warm golden sunlit grade (`contrast(1.06) saturate(1.18) brightness(1.05)`), soft peach/gold screen glow, and a gentle warm edge vignette — no horror grain or light flicker.
- **Jump cuts:** framing alternates between 1.0× and a 1.12× punch-in at every cut, with a smooth push-in inside each segment.
- **Captions:** 3-word chunks in a karaoke fill using rounded `Fredoka` typography. Each word starts warm grey (`#D8D0C5`), sweeps sun-yellow (`#FFD23F`) left to right with a bouncy pop over its spoken duration, and settles to cream-white (`#FFFDF5`) once the next word starts.
- **Cards**, which enter with a playful sparkle-burst pop transition (`#burst` corner stars + dashed ring + soft warm flash) and bouncy `back.out` spring motion:
  - `title`: big sun-yellow rounded display word with a cream sticker-pill subtitle and an optional vibrant framed photo above.
  - `case`: a cream sticker card (`#FFFDF5`) with thick dark-ink (`#1A1615`) borders, sun-yellow pill kicker, optional full-color photo, and a cherry-coral badge stamp that bounces in.
  - `photo`: a floating cream-bordered polaroid card with full-color imagery and a sun-yellow pill caption.
  - `item`: a trivia checklist entry under a sun-yellow `"KEMUNGKINAN:"` pill header. Each entry is a cream sticker bar with a spinning `★` sun-yellow badge and smooth text reveal.
  - `end`: alternating sun-yellow and cream-white display words popping in with a bouncy `back.out` stagger and gentle float.
- **Layout:** content is centered with equal side margins (captions 110 px, cards 125 px). Titles shrink to fit 840 px via `fit()`.

## Audio

- **Music:** `assets/music/sunny.mp3` ("Carefree" by Kevin MacLeod via Wikimedia Commons / incompetech.com, CC BY 4.0). Carved around the voice with `tools/carve.mjs` from `hyperframes-audio`.
- **Voice:** `afftdn` denoise and de-esser during source processing, then highpass, compressor, gain, and true-peak ceiling at −1.5 dBTP inside the composition.
- **Sound effects** in `assets/sfx/`:
  - Automatic: `shutter` (bouncy pop-swoosh on every card), `stamp` (badge pop/chime), `reveal` (upbeat marimba/chime arpeggio for checklist items), and `ending` (bright major-chord fanfare sting).
  - Usable as reactions in `config.json`: `pop`, `chime`, `boing`, `ding`, `whoosh`.

## Usage

Set `"preset": "tiktok-cheerful"` and `"music": "sunny"` in `videos/<name>/config.json`, then run:

```bash
python3 <skill>/scripts/make_tiktok.py videos/<name> --render
```

The rendered video lands at `output/<name>/tiktok-cheerful/<name>.mp4` with `CREDITS.txt` beside it.
