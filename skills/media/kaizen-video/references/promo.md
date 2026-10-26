# Product promos: template presets (app-promo)

A **template preset** is a whole HyperFrames film that fills itself from a product brief. It is used when
the user wants a video about their product: an app, a website, a tool. The first template preset is
`app-promo`, made from the kaizen launch video the user approved on 2026-10-26.

An app-promo video has these parts, in order:
- a two-second hook;
- the product's name;
- the product used for real, one task per step, each step with one caption, tap marks and camera
  punch-ins;
- an end card with the logo, the tagline and the call to action.

Everything on screen is the real product. Nothing is mocked up.

A template preset is a folder with `preset.json` (`"kind": "template"`), a `template/` HyperFrames project,
`README.md` and `CREDITS.txt`. The Video page lists it for a from-scratch start.

## 1. Learn the product, write the brief

Read the product before asking anything:
- its site or README;
- its `manifest.webmanifest`, for name, description and theme colour;
- its logo files and CSS colours.

Ask only what you cannot find:
- where it runs;
- a safe account;
- the tasks worth showing.

Then write `videos/<name>/promo.json`:

```json
{
  "product": "Notula", "url": "notula.huseinf.my.id",
  "tagline": "Record & Summarize", "cta": "notula.huseinf.my.id",
  "hook": ["You talked", "for an hour.", "Now what?"],
  "brand": { "logo": "logo.png", "bg": "#f4f3ff", "ink": "#16133a", "accent": "#4b44cf", "font": "Inter" },
  "music": "sunny",
  "steps": [
    { "clip": "list-web", "with": "list", "caption": "Every meeting, / *recorded.*", "from": 0.3, "to": 4.2 },
    { "clip": "meeting", "caption": "Who said what, / *transcribed.*", "from": 0.5, "to": 8.6 }
  ]
}
```

- **Words.** Tagline, CTA and claims use the product's own words. The hook can be a line of yours, but it
  makes no claim. Captions:
  - hold at most 6 words;
  - break lines with `/`;
  - mark the one accent word with `*word*`.

  Say each idea once: no caption repeats another.
- **Brand.** It comes from the product:
  - its theme colour as the accent;
  - its background, or the logo's ground, as `bg`;
  - its ink.

  A light brand gets a light ground; the device frames follow it.
- **Devices follow where the product runs.** Each step shows its clip's device:
  - a phone for a mobile app or PWA;
  - a browser window with the real URL for a web app;
  - a titled window for a native desktop app, which needs the user's own recording.

  `"with"` puts a second clip of the same task on another device beside it: laptop and phone together,
  for a product that runs on both. Use it once, early, to say "everywhere". Then stay on the device where
  the task reads best.

## 2. Record

Write `videos/<name>/record.json`. Each clip lists its device and its steps:

- `["tap", "text:Label" | css]`
- `["type", css, "words"]`
- `["key", "Enter"]`
- `["scroll", px]`
- `["wait", ms]`
- `["goto", "/path"]`
- `"prep"`: steps run before filming starts, such as a sign-in. Clips share one browser, so sign in on the
  first clip only.

Then run:

```
node $S/record.mjs videos/<name>     # writes rec/<clip>.mp4 + rec/<clip>.json (device, taps)
```

**Privacy:** everything on screen is filmed. Never point the recorder at a real account with real data.

| Product | What to do |
|---|---|
| has a demo account | use it |
| open-source or in ~/Projects | run a local copy with its own empty database and seed sample data made for the video |
| kaizen itself | a sandboxed board: `HOME=<scratch>/home` with `projects`/`projects_dir` pointing at a scratch copy of `.kaizen` |

Watch out for a local copy:
- **Laravel:** delete `bootstrap/cache/config.php` before any `artisan` command, or it still points at the
  real database.
- **Check the database first:** confirm the copy's own database path
  (`php artisan tinker --execute 'echo config("database.connections.sqlite.database");'`) before writing
  anything.
- **Sample content:** content made for the video (demo meetings, sample cards) is illustrative. Say so in
  the delivery note.

For a native app the recorder cannot drive, put the user's screen recording at `rec/<clip>.mp4` and write
`rec/<clip>.json` yourself: `{"device": "phone"|"app", "cssW", "cssH", "seconds", "taps": []}`.

## 3. Build, look, render

```
python3 $S/make_promo.py videos/<name>             # project in videos/<name>/promo/, check, promo/check/sheet.jpg
python3 $S/make_promo.py videos/<name> --render    # output/<name>/app-promo/<name>.mp4 + CREDITS.txt, -14 LUFS
```

Pick each step's `from`/`to` from the tap times in `rec/<clip>.json`. A step starts just before its first
tap and ends after the UI has answered.

Look at `promo/check/sheet.jpg` before rendering. Check for:
- captions clear of the device;
- each step's screen showing what its caption says;
- no private data;
- no repeated idea.

Punch-ins are automatic: on each tap the UI then has time to act on. Set `"punch": []` on a step to turn
them off, or give your own list.

## 4. Adding the next approved preset

A new look becomes a preset only after the user approves a video made with it:

1. Agree a reference with the user: a HyperFrames showcase film or any video they like. Study it frame by
   frame.
2. Make one real video in that look with the `/hyperframes` skill workflow:
   - `SPEC.md`;
   - one scene per sub-composition;
   - real material;
   - `hyperframes check`;
   - a snapshot review.

   Revise until the user says it meets their standard.
3. Turn the approved project into `presets/<name>/template/`:
   - replace its product text, colours and media with placeholders the build step fills;
   - add `preset.json` and `CREDITS.txt`;
   - add a build script, or extend `make_promo.py` when the scene contract is the same.
4. Build it on a second product before listing it. A look that only works for one product is not a preset
   yet.

Unapproved presets carry a `.hidden` file: they still build, but the New video wizard does not offer them.
