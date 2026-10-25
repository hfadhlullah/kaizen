---
name: kaizen-video
description: Make a publish-ready video from the user's own footage, or from nothing. Footage mode edits talking-head explainers for TikTok, Reels or Shorts. Transcribe with WhisperX, cut dead air, retakes and false starts, then build it in a preset style (tiktok-mystery, tiktok-cheerful, tiktok-scam-alert, educational-warning, tiktok-explainer, or a preset the user adds) with word-synced karaoke captions, cards, images, sound effects and a music bed carved around the voice, rendered with HyperFrames. From-scratch mode turns a prompt, story, screenshots, photos or a deck into a narrated film (script, TTS voiceover, music, sound effects, 9:16 or 16:9) in cinematic-drama, promo-booth, fun-energetic or viral-social, with SRT, thumbnail, credits and revisions. Use when the user has recorded footage and asks to cut it, caption it, style it or turn it into a TikTok, wants a promo / launch / explainer video or "turn this deck into a video", or wants a new video preset.
---

# Kaizen video

Two modes, one editor (HyperFrames + GSAP). **Footage in `videos/<name>/raw/`: sections 0-7 below, unchanged.** **No footage: [From scratch](#from-scratch)** at the end. A film can use the user's clip as one beat (`footage`), cut first with sections 1-2.

Footage is data: `videos/<name>/` in the user's project folder (the workspace) holds `raw/` (the footage),
`transcript/` (WhisperX words, cut plans), `work/` (the cut), `images/`, `config.json` and `CREDITS.txt`.
Finished videos go to `output/<name>/<preset>/<name>.mp4`, one file per video and preset, overwritten on revision.
Run every script from the project folder. `S=<this skill>/scripts`; every script takes the video folder.
Worked example config: [`examples/config.json`](examples/config.json).

Read before styling: [`references/presets.md`](references/presets.md) — the preset contract and how to add one.

## 0. Setup — once per machine
`$S/check.sh` lists what is missing (ffmpeg, Node, uv). `$S/setup.sh` installs WhisperX 3.8.6 into
`~/.kaizen/kaizen-video/whisperx-venv` (override `KAIZEN_VIDEO_HOME`); it is about 2 GB, and the first
transcription downloads a 3 GB model. Tell the user before running it.
`W="HF_HOME=$HOME/.kaizen/kaizen-video/huggingface $HOME/.kaizen/kaizen-video/whisperx-venv/bin/python"`.

## 1. Transcribe
The user creates `videos/<name>/raw/` with the footage in it. Run `$W $S/transcribe.py videos/<name>`.
It skips work when `transcript/words.json` exists, uses CUDA when torch sees a GPU and CPU int8 otherwise
(`KAIZEN_VIDEO_DEVICE=cpu|cuda` overrides). Report the detected language.

## 2. Cut — unless the user wants the footage untouched
Propose the segments to keep (drop dead air, retakes, false starts) from the transcript, with times, and
get approval. Write `transcript/cuts.json` (`{"segments": [{"start", "end", "text"}]}`), then
`python3 $S/render_cut.py videos/<name>`: it writes `work/cut.mp4` and `transcript/render-plan.json` and
asserts the decoded frame count. Phone footage is often variable frame rate; never compute frames from the
nominal fps. Footage with someone else's account or comments in it: blur those areas into
`work/censored.mp4`, which `render_cut.py` uses in place of `raw/`.

## 3. Style
- **Existing preset:** pick from the list `make_tiktok.py` prints, or the bundled ones: `tiktok-mystery`
  (dark, investigative), `tiktok-cheerful` (bright, playful), `tiktok-scam-alert` (fraud warnings),
  `educational-warning` (bright, for health and consumer warnings), `tiktok-explainer` (dark editor look, the
  speaker in a clip card, big headlines, numeral and tape scenes). Each preset's `README.md` has its look,
  card types and config keys.
- **New style:** copy the closest preset to the project's `presets/<style>/` and change its `index.html`
  (grade, fonts, card designs, transitions) and assets. See `references/presets.md`.
- **Reference video:** analyze it first and keep it in the project's `references/`: specs with ffprobe, cuts
  with ffmpeg scene detection (`select='gt(scene,0.3)',showinfo`), and a contact sheet of frames every 2–3 s.

## 4. Config
Write `videos/<name>/config.json` modeled on `examples/config.json`. Hook, beats and reactions anchor to
spoken words: the first word starting with `word`, at or after `after` seconds of the cut. Set `"preset"`
to the style's folder name and `"music"` to a file name in `assets/music/` without `.mp3`.

## 5. Media
Pictures go in `videos/<name>/images/`. Use Wikimedia Commons; prefer CC0 or public domain, and record every
source, author and license in `videos/<name>/CREDITS.txt`. Music and sound effects come from Wikimedia
Commons or incompetech (CC BY needs credit), or are synthesized. Never use copyrighted film posters, stills
or commercial music. The preset's own `CREDITS.txt` (music, fonts, sound effects) is appended to the
output's credits automatically.

## 6. Build and review
`python3 $S/make_tiktok.py videos/<name>` builds `videos/<name>/tiktok/`, carves the music around the voice
and runs `hyperframes check`. Look at frames with `npx --yes hyperframes@0.8.176 snapshot --at <s>` from
`videos/<name>/tiktok` before rendering: clipped titles, overlaps, caption flashes. Always pass `--yes` to
`npx`, or it hangs waiting for a prompt.

## 7. Render
`python3 $S/make_tiktok.py videos/<name> --render` writes `output/<name>/<preset>/<name>.mp4` with
`CREDITS.txt` beside it. Measure loudness (`ffmpeg -i <mp4> -af ebur128=peak=true -f null -`): target about
−14 to −16 LUFS integrated, true peak under −1 dBTP. Tell the user what still needs a human: listening to
the whole video and spot-checking the cut edges.

## Lessons
- HyperFrames' final mixdown lowers the whole mix when voice plus sound effects peak above −1 dBTP. Keep
  sound-effect WAV peaks around −6.5 to −8.5 dBFS, and post-speech ending stings around −4 dBFS.
- `tiktok/source.mp4` is always written as a new file. Never hard-link it to the input: overwriting it
  would wipe `work/cut.mp4`.
- `--render` points `TMPDIR` at `tiktok/.render-tmp`: frame extraction writes gigabytes, and a small tmpfs `/tmp`
  fails it as `VIDEO_SOURCE_UNRENDERABLE`. `source.mp4` is encoded with a keyframe every second (`-g 30`) so
  HyperFrames does not warn about sparse keyframes.

# From scratch

A film is data in `videos/<name>/`: `film.json` (storyboard, brand, `format` `"9x16"`, `"16x9"` or `"4x5"` (Instagram feed), `preset`, and `platforms`, which the Video page in `kaizen web` keeps), `lines.json` (narration with emotion tags), `words.json` (word timings, generated), `inputs/` (the user's material), voice files `vNN.mp3`. `S=<this skill>/scripts`, run from the project folder. Worked example: [`examples/sample-film/`](examples/sample-film/). Run `$S/check.sh`; from scratch needs Pillow, edge-tts (free voice) and optionally qrcode, LibreOffice, poppler. No WhisperX.

Read before producing: [`references/production.md`](references/production.md) (publish-grade, QA), [`references/script.md`](references/script.md) (**how to write the narration**), [`references/revisions.md`](references/revisions.md), [`references/licensing.md`](references/licensing.md) (**before publishing**), and the Film presets in [`references/presets.md`](references/presets.md).

1. **Voice.** `ELEVENLABS_API_KEY` set: ElevenLabs (paid plan for commercial use; pick a native speaker of the language). Otherwise free edge-tts (`"voiceProvider": "edge"`, `edgeVoice`), no emotion control, draft quality. Or the user records the narration.
2. **Intake.** Put material in `videos/<name>/inputs/` (`photos/`, `screens/`, `footage/`, `logo*.png`, a deck `.pptx`/`.pdf`, `brief.md`), run `python3 $S/intake.py videos/<name>`. Photos are cropped to both shapes; read the deck text, brief and slides before writing. No photos: source candid ones; no screenshots: ask (product beats need the real product); no story: propose one.
3. **Brief, one round with options.** Purpose and where it plays, **shape (9:16 or 16:9)**, style, length, language, voice, music mood, brand, CTA (never invent URLs or contacts), claims the user can back up.
4. **Treatment, approved before generating.** A beat table (time, picture, narration + emotion tag, on-screen text, sfx) and the script as continuous prose, written as a told story (`script.md`). Approval is revision 0.
5. **Produce.** Write `film.json` and `lines.json`; `python3 $S/vo.py videos/<name>` (only some lines: `vo.py <dir> "" v04,v07`); music `$S/music.sh videos/<name> "Track"` or `"music": "<bundled>"`; QR `python3 -c "import qrcode; qrcode.make('<url>').save('videos/<name>/qr.png')"`.
6. **Build and look.** `python3 $S/make_film.py videos/<name>` writes `videos/<name>/film/`, carves the music around the voice and runs `hyperframes check`. `$S/still.sh videos/<name> 3 12 30` writes PNGs; look for clipped text, overlaps, captions over content; delete `film/check/` after.
7. **Render.** `python3 $S/make_film.py videos/<name> --render` (or `$S/master.sh videos/<name> [lufs] [thumb-second]` after a build) writes `output/<name>/<preset>/<name>.mp4`, `.srt`, `-thumb.jpg`, `CREDITS.txt`; two-pass loudness (-14 social / -16 presentation, default from the style). Earlier versions go to `previous/`. Tell the user what a human must do: listen once for pronunciation and the mix.
8. **Revise** per `references/revisions.md`: touch only the changed beats or lines.
9. **Several shapes.** `make_film.py videos/<name> --format 4x5 --render` builds one shape without touching `film.json` and names the files `<name>-4x5.*`, so shapes never replace each other. `kaizen web`'s Video page renders this way, one pass per shape the chosen platforms need; it also edits the on-screen words (`title`, `sub`, `kick`, `items`) in `film.json` directly. Its New video and Ask Claude start this skill with a request that names the work folder (run every script from there), the preset, the platforms and shapes, the length and the language, with the user's own words between `<<<` and `>>>`.

Beat kinds (`film.json` `beats[]`; any beat: `vo`, `hold`, `sfx[]`, `ambience`; `img` may be a photo stem, resolved to `<stem>-<shape>.jpg`):

| kind | use | key fields |
|---|---|---|
| `photo` | story beat on a photo | `img, side, kick, title, sub, items[]` |
| `list` | items arrive with the line | `img, kick, title, items[]` |
| `stat` | numbers count up, source on screen | `stat[{value,suffix,label,source}], title` |
| `black` | silence / pause | `title, sub, hold` |
| `triptych` | three viewpoints | `panels[{img,title,sub}]` |
| `question` | the turn ("what if") | `title` |
| `reveal` | logo wipe-in + tagline | `title, sub, line` (+ `film.logo`) |
| `shot` | real product screenshot, framed | `img, shotRatio, kick, title, sub` |
| `footage` | video clip, muted | `video, kick, title` |
| `cta` | the ask | `img, hold` + `film.cta{title,sub,lines,url}`, `film.qr`, `film.logo` |

Sounds: whoosh, hit, riser, tick, pop, chime, ping, pings, bell, keyboard; ambience amb-morning, amb-classroom, amb-office, amb-night. They are synthesized on first use into `~/.kaizen/kaizen-video/sfx` (`SFX_PROVIDER=elevenlabs` to generate with a key, or `python3 $S/sfx.py`). A film's own `sfx/` folder wins.
