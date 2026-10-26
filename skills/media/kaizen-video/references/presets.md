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

# Film presets (from scratch)

`make_film.py` finds a film preset by the folder holding `style.json` (same three places as above), so the two kinds never collide. Bundled: `film-cinematic-drama`, `film-promo-booth`, `film-fun-energetic`, `film-viral-social`. Each works in 9:16 and 16:9; the `window` and `card` layouts fall back to full-bleed in 9:16.
| preset | use for | look & motion | audio | captions | loudness |
|---|---|---|---|---|---|
| cinematic-drama | pitch opener, brand film | dark, full-bleed photos, slow push-in, rise text, grain + vignette, fades | quiet music, hit on reveal, riser into the question, room tone | subtitle bar | −16 |
| promo-booth | exhibition loop, deck-faithful promo (the friend's style) | photo in a framed window beside the text, wipes, slide-in text, staged builds | whoosh on cuts, tick on titles, slightly louder music | subtitle bar | −16 |
| fun-energetic | social posts, parents, events | cream background, rounded photo cards that bounce in, pop text, light leaks | bright track (Carefree), pops and a chime | subtitle bar | −14 |
| explainer-canvas | TikTok explainers that move like a motion-graphics edit (9:16) | one canvas, camera pans, zooms and follows; filmstrip, numerals, tape and stamp (`references/canvas.md`) | whoosh, pop, tick, stamp | kinetic, lowercase | −14 |
| viral-social | TikTok / Reels / Shorts (9:16) | full-bleed, fast punch-in cuts, bold Inter, strong Ken Burns | Easy Lemon-type track, whooshes | kinetic 2–3 words, accent on the spoken word | −14 |

Pace: `lead` / `tail` = silence before and after each line. Drama 0.8/1.1, booth 0.45/0.7, fun 0.2/0.35, viral 0.05/0.2.

## Template presets

`app-promo` is a template preset (`preset.json`, kind `template`): a whole HyperFrames film filled from a product brief, built by `make_promo.py`. See [`promo.md`](promo.md). The New video wizard offers it for a brief start, and the five footage presets (tiktok-explainer, tiktok-mystery, tiktok-cheerful, tiktok-scam-alert, educational-warning) for a footage start only: a footage preset edits the user's own recording, so a brief with one is refused. The film-* presets carry a `.hidden` file until the user approves a video made with them; they still build for existing videos.

## Crossing over

A film preset works for a footage start too: the build script notices it and bridges. A footage preset is offered only for footage on the Video page (2026-10-26); the brief-to-footage bridge below still works when make_film.py is run by hand.

- **Footage with a film preset.** `make_tiktok.py` writes `videos/<name>/film-bridge/`: the cut (`video` in the
  config) re-encoded silent as `footage.mp4`, its sound as `v01.mp3`, the caption words as `words.json`, and a
  `film.json` with one `footage` beat and `"style": {"pace": {"lead": 0, "tail": 0}}` so the voice stays on the lips.
  It then runs `make_film.py` on that folder (passing `--render`), which writes `output/<name>/<preset>/` with the
  .srt and thumbnail. Kept: the film style's grade, captions, music levels and loudness, and the config's `music`.
  Dropped: the hook, the cold open and every card in `beats`.
- **A brief with a footage preset.** `make_film.py` builds the film in `film-viral-social` with no captions, no
  music and no cut sounds, renders it to `videos/<name>/film/pass1.mp4` on every build, then writes
  `videos/<name>/footage-bridge/config.json` (the film's words on that timeline, a jump cut at every scene,
  `hook` from film.json or the first six words, `music` from film.json or `sunny`) and runs `make_tiktok.py` on
  it. Pass 1 carries pictures only and the clip card is hidden (`"card": false`), so the template draws the words
  as its own scenes. Each film scene opens on a headline scene after the 3 s hook (`title` with kick, title, sub
  and picture; `stat` with its first value as the giant numeral; `question` with a giant `?`), then `photo` scenes
  cycle the beat's `img` and `"pics"` at its phrase breaks, about every 2 s, with the captions on. `items` become
  `item` rows and `cta` the `end` card. Under the hook, the first picture shows. A headline over 14 characters
  moves to the serif line with a warning. film.json `"footage_beats"` (template beats, placed with
  `"t"` seconds or `"word"`) replaces the mapping; `"mascot"` (a transparent PNG in the video folder) adds the
  corner mascot. 9:16 only; no .srt. A build takes a render longer.

`film.json` `"style"` overrides keys of the preset's `style.json` for one film; a dict merges into the preset's.

## Writing for each preset
- **drama**: full story arc, 70–110 s, long pauses allowed.
- **booth**: the deck's beats in order, 80–100 s, must make sense when joined mid-loop; real contacts on the CTA.
- **fun**: 35–50 s, playful lines ("Kenal rasanya?"), one problem montage, three quick benefits.
- **viral**: ≤ 30 s, line 1 is the hook (a sharp, relatable pain), product by second ~12, one CTA.

## Adding a preset
Copy a `film-*` folder to `presets/<name>/` in the project and edit its `style.json` (no `index.html`: `film.html` is shared); fields: palette, fonts (any font file in `assets/film-fonts/` or the preset's `assets/fonts/`, named like `PlayfairDisplay.ttf`), pace, text (rise|slide|pop), transition (fade|wipe|punch),
layout (fullbleed|window|card), grade, captions (subtitle|kinetic|none), music levels, sfx names, kenburns, loudness.
