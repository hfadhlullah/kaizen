# TikTok explainer preset

A 1080×1920 HyperFrames style for talking-head tips and how-to explainers. It was modeled on a short motion-graphics explainer: a near-black editor look in which the speaker plays inside a clip card, carried by big headlines.

## Look and motion

- **Palette:** near-black `#0c0b0a` with two soft diagonal light streaks that drift, cream `#efe6d6` text, orange `#f7a93b` accent, and red `#ef4b3a` for stamps.
- **Type:** Montserrat 900 headlines with tight tracking, small Instrument Serif setup lines above or below them, and Space Mono for timecodes and chips. A trailing `?`, `!` or `.` on any headline turns orange.
- **Clip card:** the footage sits in a rounded, cream-framed card (700×930, cropped to the upper face) with a running `● 0:07` timecode chip. It tilts ±1.6° and alternates scale at every jump cut, with a slow push inside each segment.
- **Hook:** `line1` is the serif setup line, `line2` the huge headline, and `sub` an orange serif line under it. It holds for 3 s above the card.
- **Captions:** kinetic. Each word pops in as it is spoken, in lowercase Montserrat 900, orange while spoken and cream afterwards. Unspoken words are not shown yet. Captions sit under the card and are hidden while a scene owns the screen (photo cards keep them).
- **Scenes** (beats):
  - `title`: the card tucks to the top right. With `big` (for example `"1"`), a giant outlined numeral fills up in orange behind it, and the text sits bottom left; without it, the text is centered. Keys: `kicker` (serif, above), `title` (headline), `sub` (orange serif, below), optional `img`, and `dur` (default 1.8 s).
  - `case`: a banner scene. `kicker` (serif) and `sub` (bold headline) sit on top, the card greys out, an orange tape with `title` slaps across it, and an optional red `stamp` (for example `"ZONK"`) slams on with the stamp sound. Optional `note` is a serif line at the bottom. Lasts 3.2 s.
  - `photo`: the clip card is swept off to the left and an image card slides in from the right, with an optional mono `label` chip. Lasts 2.8 s.
  - `item`: a steps list. Each row is an orange mono chip (`label`, default `01`, `02`, …) plus a bold line (`text`). The first item may carry `head`, an orange serif header. The card tucks aside while the list shows. The list leaves at the first jump cut after its last item, at most 6 s later.
  - `end`: the card fades out. `title` (use `\n` for line breaks) stacks in, a giant orange glyph (`big`, default `?`) bounces in on the ending sting and wiggles, and `sub` (for example "jawab di komen ↓") fades in. It holds through `tail`.
  - `mascot`: optional. A corner character from the video's `images/` (`img`, for example `mascot.png`, a transparent PNG) pops in at its word and bobs until the end.

## Audio

- **Music:** any shared track. `lights` at about 0.28 suits the reference's calm pace. It is carved around the voice like the other presets.
- **Voice:** the same chain as the other presets (rumble cut, compressor, gain, −1.5 dBTP ceiling). A test render landed at about −16.8 LUFS integrated with a −1.1 dBFS peak.
- **Sound effects** in `assets/sfx/`, all synthesized (CC0), with peaks around −7 to −9 dBFS:
  - Automatic: `shutter` (a soft swipe on every `title`, `case` and `photo`), `stamp` (a thud under the stamp), `reveal` (a pop-and-chime on each `item`) and `ending` (a 1.2 s riser into a hit).
  - Reactions: `pop`, `tick`, `ding`, `whoosh`, `boing`.

## Config example

```json
{
  "preset": "tiktok-explainer",
  "hook": { "line1": "klip lu dibuka pake", "line2": "BASA-BASI?", "sub": "momen serunya baru di tengah" },
  "music": "lights", "music_volume": 0.28,
  "beats": [
    { "kind": "mascot", "word": "klip", "img": "mascot.png" },
    { "kind": "title", "word": "detik", "big": "1", "kicker": "detik satu:", "title": "PUNCHLINE", "sub": "atau pertanyaan?", "dur": 2.6 },
    { "kind": "case", "word": "janji", "kicker": "asal judulnya", "sub": "jangan janjiin yang gak ada.", "title": "GAK NYANGKA ENDINGNYA!!", "stamp": "ZONK" },
    { "kind": "item", "word": "nyapa", "head": "yang lama:", "label": "0:01", "text": "nyapa dulu" },
    { "kind": "end", "word": "terakhir", "title": "momen terbaiknya\ndetik ke", "big": "?", "sub": "jawab di komen ↓" }
  ],
  "tail": 2.5
}
```

The other keys (`video`, `words`, `plan`, `fix`, `cold_open`, `reactions`, `crf`) work as in the other presets; see the skill's `examples/config.json`.

## Notes

- Cards should not overlap. A `title` with a `big` numeral reads best at a `dur` of 2.4–3 s.
- Keep `title` and banner text short. Headlines shrink to fit 900 px, but anything past about 14 characters on one line gets small.
- `hyperframes check` warns about low contrast on the tape text at the moment the banner fades out. That is the fade, not the design.
