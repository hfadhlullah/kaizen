# TikTok scam-alert preset

A 1080×1920 HyperFrames style for public-warning explainers about fraud. It was copied from `tiktok-mystery` and keeps that preset's config keys and card types.

## Look and motion

- **Grade:** high contrast and desaturated, with a heavy vignette and light grain. There is no flicker.
- **Hook:** "line1" in big yellow, "line2" in white, and a red subtitle box, all between two strips of hazard tape.
- **Card entrance:** red brackets, an "AWAS" tag, shutter blades, and a red alarm border that pulses with the swoosh (`shutter.wav`).
- **Captions:** karaoke fill in yellow.
- **Card types:**
  - `title`: hazard tape, a white headline, and a red subtitle box.
  - `case`: a white report card with a red edge and an optional red stamp.
  - `photo`: as in mystery, plus `"tall": true` for full-height screenshots (red frame, top-anchored) and `"dur"` in seconds, and `"pos"` (CSS object-position, e.g. `"50% 100%"` to show the bottom of a chat). Captions hide while a tall photo is up.
  - `item`: the "TIPS AMAN:" checklist with green check marks that pop in.
  - `end`: yellow words between hazard tape.

## Audio

- **Music:** `investigations.mp3` (Kevin MacLeod, CC BY 4.0).
- **Synthesized sound effects (ffmpeg, CC0):** `shutter` (fast swoosh into a low knock), `stamp` (heavy rubber-stamp thud), `reveal` (tip chime), `ending` (noise riser into a low hit at 1.2 s). Peaks are −7 dBFS, and the ending is −4 dBFS.
- **Kept from mystery:** `ding`, `whoosh`, `heart` and `clock` (usable as reactions for tension).

Usage is the same as `presets/tiktok-mystery/README.md`.
