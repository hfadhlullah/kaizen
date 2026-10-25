# Rules learned the hard way

## Truth
- Features: only what has shipped. Verify in the product repo: CHANGELOG released
  versions + existing pages/routes. "Unreleased", proposals, SPH/quotation docs = not shipped.
  Note what is missing (e.g. no iOS, no payment gateway) and keep it out of the copy;
  warn in speaker notes.
- A requirements/spec doc is not proof of shipping: confirm each feature in the CHANGELOG or in
  the code itself (content files, pages). Re-read the top of every CHANGELOG right before
  delivering — products ship while decks are being made (a product changed its login model
  mid-project once and two slides were already wrong).
- Stats: never invent. Use official/scientific sources (e.g. Dapodik, BPS, peer-reviewed
  journals); put a full `Sumber: …` line on the slide and details in notes. If no source
  exists for a planned stat, swap the stat — do not leave a fake number.
- Narrative numbers ("140 pesan belum dibaca") are fine but tell the user they are story, not data.

## Images
- Unsplash blocks curl/napi (bot wall). Use a web-fetch tool on `https://unsplash.com/s/photos/<query>`
  asking for non-premium image URLs, then download
  `https://images.unsplash.com/photo-<id>?w=1600&q=80&fm=jpg` with curl (that CDN works).
- Prefer real local scenes (for Indonesia: query `indonesia-school`, `sekolah`, `pesantren`,
  `indonesian-teacher`, `indonesia-mechanic`). Build a contact sheet and LOOK before choosing.
- Never use pptxgenjs `sizing: cover` — Google Slides ignores it and stretches. Crop each
  image to the exact box ratio in `prep_images.py` (panels: `[w_px, h_px]` = box ratio).
- Every photo must show the slide's own sentence. Problem slides show the real-world pain
  (the workshop, the office, the WhatsApp phone); product and feature slides show people
  USING the kind of tech the product is (students at computers / circuit simulation for a
  simulator, adults in a training room or on laptops for an LMS). A pretty but unrelated
  photo (a camera crew, a sermon, kids on a teacher-training slide) gets swapped.
- Show modern equipment (flat screens, laptops) — never CRT monitors or dated labs when
  selling software. Mix genders in group shots of students; avoid all-one-gender rooms.
- For product slides, the product's REAL interface beats any stock photo: look in the repo for
  screenshots/renders (`public/landing/`, `.preview/`, docs) and use them — framed via
  `scene({shot, shotRatio})`, or graded as a background if it is a dark render. Never stock
  photos of program code on screen for a non-coding product.
- Candid only: people absorbed in what they are doing (teaching, reading, working). No posed
  portraits — nobody looking into the camera and smiling; it reads as stock and breaks the film.
  Hands, backs, profiles and wide scenes work best.
- Photos with readable foreign text (e.g. English survey paper) break the illusion — swap.

## Fonts
- Default Playfair Display + Inter (both in the Google Slides font menu). Install them locally
  with `~/.kaizen/decks/.venv/bin/python scripts/install_fonts.py` — it makes STATIC instances. Never install the variable
  `[wght]` files: some viewers (LibreOffice desktop) draw big headlines greyed out, as if
  transparent, while the XML colour is correct. A missing font (e.g. Cambria) renders with
  ugly letter spacing.
- If a user reports "text not seen": first check the slide XML colour (unzip, look for
  `srgbClr`/`alpha` on that run). Solid colour there = viewer/font problem, not the deck.
- Playfair numbers are old-style (low digits); mention it, offer Lora if unwanted.

## Files and tools
- Output decks as local `.pptx` (user imports into Google Slides). No Artifacts.
- Everything the skill generates lives in `~/.kaizen/decks/<slug>/`; never write inside the user's
  project folders. Reading assets (logos, screenshots) from repos is fine.
- zsh does not word-split `$var` in `for x in $ids` — wrap in `bash -c` or use arrays.
- `qa.sh` uses the shared `~/.kaizen/decks/.venv` and creates it when missing.

## QA loop
Run `qa.sh build-x.js`, look at every sheet, fix: text overflowing into the next block
(headline wrapped to 3 lines), kicker wrapping, labels wrapping in cards, low contrast on
bright photos (raise gradient strength), page number collisions. Re-run until clean.
Delete `qa/` and PDFs at the end.
