---
name: kaizen-video
description: Edit the user's own footage into a publish-ready vertical video — talking-head explainers for TikTok, Reels or Shorts. Transcribe with WhisperX, cut dead air, retakes and false starts, then build it in a preset style (tiktok-mystery, tiktok-cheerful, tiktok-scam-alert, educational-warning, or a preset the user adds) with word-synced karaoke captions, cards, images, sound effects and a music bed carved around the voice, rendered with HyperFrames. Use when the user has recorded footage and asks to cut it, caption it, style it or turn it into a TikTok, or wants a new video preset. Not for narrated product films made from scratch (that is kaizen-motion).
---

# Kaizen video

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
  `educational-warning` (bright, for health and consumer warnings). Each preset's `README.md` has its look,
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
