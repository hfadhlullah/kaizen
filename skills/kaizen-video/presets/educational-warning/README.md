# Educational-warning preset

A bright 1080×1920 HyperFrames style for health and consumer warning explainers. It is light and calm rather than dark or scary. It uses the same config keys and card types as the other presets, but its look and motion are its own.

## Look and motion

- **Grade:** natural and slightly lifted, with no vignette and no grain. Grid paper sits behind the camera.
- **Transition:** an amber band and a navy band swipe across the frame. Meanwhile the camera steps back onto the grid paper (it shrinks, rounds its corners and gets a light wash) for as long as a card is up.
- **Jump cuts:** a small settle-in zoom at the start of each segment.
- **Hook:** a white card. The warning sign bounces in, `line1` (red) and `line2` rise out of masks, and `sub` pops in as an amber pill.
- **Captions:** a white box. Upcoming words are grey, the current word sits on an amber marker, and spoken words turn dark.
- **Card types:**
  - `title`: a dark headline on white, with an amber marker stroke that grows behind it and an optional teal `sub` pill.
  - `case`: a fact card with a teal header (`kicker`). It flips up from its top edge. `stamp` becomes a round red badge.
  - `photo`: a white print with a red "CONTOH" tag and a red circle drawn on the image. Optional keys: `dur` (seconds), `pos` (CSS object-position), and `cx`/`cy`/`rx`/`ry` (circle center and radii, as % of the image).
  - `item`: a numbered checklist on a clipboard card titled "SEBELUM BELI, INGAT:". Items slide in from a blur.
  - `end`: a hanging warning sign with the title under it. It drops in and swings to rest on the chord hit.

## Audio

- **Music:** `lights.mp3` (Rafael Krux, CC BY 4.0). Use a low `music_volume`, around 0.2.
- **Sound effects** (synthesized with ffmpeg, CC0): `shutter` (swipe), `stamp` (badge pop), `reveal` (two-note tick) and `ending` (riser into a chord at 1.2 s). Peaks are about −7 to −8.5 dBFS, and the ending is about −4 dBFS.

## Censoring screen recordings

If the footage has someone else's account or comments in it, blur those areas into `videos/<name>/work/censored.mp4`. `render_cut.py` uses that file in place of `raw/` when it exists. Blur each area with a cropped `boxblur` overlaid back in place, limited in time with `enable='between(t,a,b)'`, for example `[0:v]split[b][r];[r]crop=230:50:40:36,boxblur=10:3:5:3[c];[b][c]overlay=40:36:enable='between(t,0,6.85)'`.
