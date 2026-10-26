# Canvas films: a camera over one large canvas

A preset whose `style.json` has `"engine": "canvas"` (bundled: `film-explainer-canvas`) builds the film with
`canvas.html` instead of `film.html`. The whole video is one large canvas of elements. Each beat moves a camera over
it, and acts on the elements, timed to the narration. Everything else is a normal film: `lines.json`, `vo.py`,
`words.json`, kinetic captions, music, loudness, `make_film.py --render`. 9:16 only. Worked example:
[`examples/canvas-film/`](../examples/canvas-film/). It has the pixel-art sources: run `pixel.py` on each `.txt` first.

## film.json

```json
"canvas": { "w": 3400, "h": 7600, "elements": [ { "id": "basa", "kind": "text", "x": 170, "y": 320, "size": 150, "text": "BASA-BASI*?*" } ] },
"mascot": "cat.png",
"beats": [ { "vo": "v01", "cam": { "to": "basa", "zoom": 1.0 }, "do": [ { "act": "pop", "el": "basa", "at": "word:basa" } ] } ]
```

Coordinates are canvas pixels (the screen is 1080×1920 at zoom 1). `x`/`y` is an element's top-left. Any element
takes `rot` (degrees) and `hidden: true` (invisible until a `pop` or `fade` shows it).

| kind | fields |
|---|---|
| `text` | `text` (`*word*` = accent, `\n` = new line), `size`, `font` `head`/`serif`/`mono`, `color` `fg`/`accent`/`muted`/`red`, `w` (wrap width), `align` |
| `img` | `img` (a file in the video folder), `w`, `h`, `frame` (cream-framed card), `pixel` (sharp pixel art), `fit`, `chip` (mono tag), `label` (serif line under it) |
| `card` | a framed card with big text: `text`, `w`, `h`, `size`, `fill` (`accent` for an orange card), `color` |
| `strip` | a filmstrip: `frames` (each `{img}` or `{text}`, plus `tc` timecode), `fw`, `fh`, `gap`, `pixel`, `playhead` (frame index; adds a red playhead). Its cells are targets named `<id>/<n>` |
| `numeral` | a giant outlined digit: `value`, `size`, `w`; `fill` fills it, `morph` swaps it to the next value |
| `tape` | an orange banner: `text`, `w`, `size`, `stamp` (red stamp text that slams on with `stamp`) |

## Camera (`cam`, at the beat's start)

`{"to": "<id>" | [x, y], "zoom": 1.2, "dur": 0.8, "ease": "power3.inOut", "offset": [dx, dy]}`. The target's centre
lands at 42% of the screen height, above the captions. Without `zoom`, the camera fits the element. `dur: 0` cuts.
A beat with no `cam` holds the frame.

## Actions (`do`)

Each action has `at`: seconds from the beat's start, or `"word:<w>"`, the moment the beat's first word starting with `<w>`
is spoken. Every action carries a sound (in brackets); `"sfx": ""` silences it, and `"vol"` sets its level.

- `move` (whoosh): `el` goes to `to` (an id or `[x, y]`, centre to centre) over `dur`. `arc` lifts it along a curve and `lift` scales it mid-flight. `follow: true` makes the camera ride along, with an optional `zoom`.
- `pop` (pop): scale in from nothing.
- `fade`: to `to` (default 1) over `dur`.
- `glow`: an orange ring and a slight scale-up.
- `scrub` (tick): a strip's playhead from frame `from` to `to` over `dur`, showing each frame's `tc`.
- `fill` (reveal): the numeral fills with orange.
- `morph` (shutter): the numeral swaps to `to` and fills again (`fill: false` keeps the outline).
- `stamp` (stamp): a tape slaps on, then its stamp slams. Give the tape `hidden: true`.
- `shake`: a short camera shake.

## Choreographing a video

- One idea per beat; the camera moves at the start of every beat, so a scene changes every 2–4 s. Add actions
  inside long lines so something moves about every 1.5–2.5 s.
- Lay the canvas out as the story's map: sections top to bottom, about 1500 px apart, so a wide shot of one section
  does not show the next. Keep each section within roughly 1080/zoom by 1100/zoom canvas pixels around its centre.
- Reuse elements across beats (pan along the same strip, carry a card from one section into the next). Continuity is
  what makes it feel like one camera, not a slideshow.
- Put actions on the spoken word they illustrate (`word:`), not on round seconds.
- Check framing with `npx --yes hyperframes@0.8.176 snapshot --at <s>,<s>` in `videos/<name>/film` before rendering.
- Pictures: the user's assets, else pixel art (`pixel.py`), else Wikimedia. Credit them in `CREDITS.txt`.
