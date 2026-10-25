# Presets

A preset is a folder. `make_tiktok.py` finds it by the name in the video's `config.json` (`"preset"`),
looking in this order and taking the first folder that has an `index.html`:

1. `presets/<name>/` in the project folder — styles for this project.
2. `$KAIZEN_VIDEO_PRESETS/<name>/`, default `~/.kaizen/video-presets/<name>/` — your own styles, for every project.
3. `<skill>/presets/<name>/` — the bundled ones.

A local preset with a bundled name overrides the bundled one. An unknown name stops the build and lists
every preset it can see. Nothing is registered anywhere: adding a folder is adding a preset.

## What goes in the folder

| File | Required | Notes |
|---|---|---|
| `index.html` | yes | The HyperFrames composition template. |
| `package.json` | yes | Pins `@hyperframes/core` (copy one from a bundled preset). |
| `README.md` | yes | Look, motion, card types, sounds and config keys, for whoever picks a style. |
| `CREDITS.txt` | yes | Source, author and license of every font and sound file the preset uses, copied into every render's credits. Credit a preset's own music as a line `- <name>.mp3: <title, author, license>`; the render credits only the track the video uses, looked up here and then in the skill's `assets/CREDITS.txt`. |
| `assets/sfx/*.wav` | yes | Sound effects, 48 kHz, any WAV encoding. Durations are read from the files with ffprobe. |
| `assets/fonts/*.ttf` | no | Falls back to the skill's `assets/fonts/` (Montserrat, Fredoka, Special Elite). |
| `assets/music/*.mp3` | no | Falls back to the skill's `assets/music/` (`lights`, `investigations`, `sunny`). |
| `tools/carve.mjs`, `hyperframes.json` | no | Fall back to the skill's copies. |

A file in the preset always wins over the shared one with the same name, so a preset can replace a font or
a track without touching the others.

## Template contract

`make_tiktok.py` fills these in `index.html`; keep them:

- `{{DURATION}}`, `{{VIDEO_DURATION}}`, `{{VIDEO}}`, `{{MUSIC_VOLUME}}`
- `{{HOOK_1}}`, `{{HOOK_2}}`, `{{HOOK_SUB}}`
- `<!-- SFX:BEGIN -->` — where the sound-effect `<audio>` tags are inserted.

The composition also reads `captions.js` (`window.CAPTIONS`, `window.SEG_STARTS`, `window.BEATS`), and its
voice element must have the id `a-roll` and the music bed the id `music`, because the music is carved around
the voice by those ids.

Sounds the script places itself: `shutter` (every card), `stamp` (a beat with `"stamp"`), `reveal` (each
`item`) and `ending` (the `end` beat). Any other wav in `assets/sfx/` can be used as a reaction in the
config (`{"sfx": "<file name>", "word", "after", "offset", "volume"}`). Keep peaks around −6.5 to −8.5 dBFS.

## Adding one

1. Copy the closest preset to the project's `presets/<style>/` (or `~/.kaizen/video-presets/<style>/`).
2. Change `index.html` and the assets, update `README.md`, and write `CREDITS.txt` for every file you add.
3. Set `"preset": "<style>"` in a video's config and build it.

To ship it to everyone who installs kaizen, copy the folder into this skill's `presets/` in the kaizen
repository. Move any music or font another preset could use into the shared `assets/`, credit it in
`assets/CREDITS.txt`, and keep only the preset's own files in its folder: every byte here goes into the
kaizen package.
