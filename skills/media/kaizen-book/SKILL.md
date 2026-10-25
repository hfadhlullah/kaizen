---
name: kaizen-book
description: Write, proofread and publish a book. Interviews the author first (kind of book, genre such as sci-fi, romance, fantasy, thriller, memoir or non-fiction, readers, language, length, voice, look), then outlines and drafts it chapter by chapter with a style sheet, proofreads with a numbered change list, and builds a single-file offline e-book that reads like a real book (cover that opens, page-flip, paper, themes, font size, resume), an A5 colour print PDF, a black-and-white print PDF, optional volume PDFs, and a website folder with WhatsApp/social link previews. Use when the user wants to write a book, novel, novella, memoir or story collection, turn a manuscript (Markdown or .docx) into an e-book or printable PDF, proofread a manuscript, or publish a book online.
---

# Kaizen book

A book lives in `book/` in the user's project folder, and everything it produces goes to `output/`:

```
book/
  brief.md        interview answers, approved by the author
  outline.md      chapter plan, approved by the author
  style.md        style sheet: names, spellings, voice rules, facts so far
  manuscript.md   the text (# Part, ## Chapter | subtitle, ### Section, [^1] footnotes)
  book.json       title, author, lang, style, cover, url, volumes…
  images/         cover and figures
  proofread.md    numbered change list, marked applied / declined
output/
  book.html       the e-book: one file, works offline
  book.pdf        A5 colour print
  book-mono.pdf   A5 black and white (white typeset cover, greyscale images and emoji)
  book-vol-N.pdf  one per volume, black and white (or colour), continuous page numbers
  og.jpg          1200×630 link-preview image
  shots/          screenshots from verify.mjs
  deploy/         static site: index.html (preview loader), reader.html, PDFs, og.jpg
```

Run every script from the project folder. `S=<this skill>/scripts`. Worked example: [`examples/`](examples/).

## 0. Setup, once per machine
`$S/check.sh` lists what is missing (python3, node, poppler's `pdfinfo`, Playwright). `$S/setup.sh` installs
Playwright 1.62.1 and Chromium into `~/.kaizen/kaizen-book` (override with `KAIZEN_BOOK_HOME`), which is about 150 MB.
Tell the user before you run it. Building the HTML needs only python3. PDFs and screenshots need the rest.

## 1. Where to start
- **A new book**: interview first. Read [`references/interview.md`](references/interview.md) and follow it.
  Nothing is written until `brief.md` is approved.
- **An existing manuscript** (.md, .docx, pasted text): convert it as described at the end of
  [`references/writing.md`](references/writing.md), write `book.json`, and go to step 3. Ask only what
  `book.json` needs (title, author, language, style, cover, url).
- **A revision of a built book**: change `manuscript.md`, then repeat steps 3–5. Never hand-edit `output/`.

## 2. Write
Follow [`references/writing.md`](references/writing.md): the outline, approved; the style sheet; chapters
in batches of three to five, with a stop for the author after each batch. Never invent facts, sources or quotes.
Mark open questions `[[CHECK: …]]`.

## 3. Proofread
Follow [`references/proofread.md`](references/proofread.md). Run `python3 $S/check_book.py book` for
structure, then write `book/proofread.md` as a numbered change list. Apply only the numbers the author
accepts. The build does not go ahead while `check_book.py` reports errors.

## 4. Build and look
```
python3 $S/build_book.py book            # → output/book.html (fonts embedded, cached in ~/.kaizen/kaizen-book/fonts)
node $S/verify.mjs output/book.html      # phone + spread smoke test, screenshots in output/shots/
node $S/pdf.mjs output/book.html         # → book.pdf, book-mono.pdf, book-vol-N.pdf, og.jpg
```
- `verify.mjs` must report `all checks passed`: no page errors, every chapter opens, nothing clipped
  past a page, no horizontal scroll, flips cross chapters, and resume keeps the chapter, page, theme and font size.
  Look at the screenshots yourself, and show the cover and one spread to the author.
- `pdf.mjs` prints the book twice so the contents page carries real page numbers, read from the PDF's
  named destinations with `pdfinfo -dests`. `--only color,mono,volumes,og` limits what it makes.
- Look at the PDF pages before handing them over (`pdftoppm -r 40 -png output/book.pdf /tmp/p` then a contact sheet):
  the cover, the contents, a part page, a chapter opening, a page with an image, and the mono cover.

### book.json
| Key | Meaning |
|---|---|
| `title`, `subtitle`, `author`, `tagline` | Used on the cover, title page, contents and link preview |
| `lang` | `id`, `en`, or another code. `id`/`en` have built-in interface labels; override any with `"labels": {…}` (keys are in `build_book.py`) |
| `style` | `classic` · `romance` · `scifi` · `fantasy` · `thriller` · `literary` · `children` (from `assets/styles.json`) |
| `theme` | Per-book overrides of the style, e.g. `{"cover": {"bg": "#123"}, "accent": "#a33"}` |
| `cover` | Path in `book/` to a 2:3 image. Empty means a typeset cover in the style's colours. The mono PDF always uses the typeset cover |
| `copyright`, `dedication` | Front-matter pages in the PDFs (`\n` for line breaks) |
| `description`, `url` | Link preview text, and the site's absolute URL (needed for `og:image`) |
| `volumes` | `[{"label": "Volume 1"}, {"label": "Volume 2", "from_part": 6}]`. `from_part` is the 1-based number of the `#` part a volume starts at |
| `volume_print` | `mono` (default) or `color`: which print the volume PDFs are cut from. An image cover gets the volume label on a band |
| `manuscript`, `id` | Other manuscript file name; storage key for reading position (defaults to the title) |

To add a style, copy an entry in `assets/styles.json` (Google Fonts family names; cover `pattern` is one of
`frame grid petals slash dots none`).

## 5. Publish
`python3 $S/deploy.py book` assembles `output/deploy/`, which can be hosted anywhere static (`cd output/deploy && npx vercel --prod`,
Netlify, GitHub Pages, or a Cloudflare tunnel). Publishing is outward-facing, so confirm with the user before deploying.
- `index.html` is a 2 KB page carrying the og tags that then loads `reader.html`. WhatsApp and other previewers
  give up on a multi-MB page before they read its head. Don't replace index.html with the book.
- The reader's "Print / PDF" button opens `book.pdf` when the site has one, because iOS Safari ignores `@page` and
  prints with white margins. Opened as a file, the button prints the built-in print layout instead.
- The PDFs are snapshots. After any change to the text, rebuild everything in step 4 and redeploy. Volumes are found
  by part, so they follow the text without hand-kept page numbers.

## What the reader does
Cover board with cloth grain that swings open onto a half-title page, contents, and CSS-column pages on textured
paper. Phones show one page, and landscape screens 900 px or wider show a spread. Pages turn with a 3D flip (a fade with reduced motion)
by swipe, by tapping the outer 30% of the page, or with arrow keys, PageUp/PageDown or Space. Running heads and page numbers on every page (numbered through the whole book; in a spread each chapter starts on a left page),
drop cap at each chapter opening, part opener pages, text before the first heading shown as a lead-in before the first chapter, fenced code blocks, footnote markers that open the note, and themes (paper / sepia / night). Font size
13–28 px, and the position is saved per book in localStorage. Text is justified only when a column is at least 380 px wide, to avoid
rivers on phones. Paragraphs use `dir="auto"`, so Arabic or Hebrew passages in a left-to-right book display correctly. A fully
right-to-left book is not supported yet.

## Kaizen
Inside a kaizen run, the brief and outline approvals are the plan approval, each batch of chapters is a build, and the
review reads the chapters against `brief.md`, `style.md` and the outline. For a built book, the review also needs
`verify.mjs` passing and the PDF contact sheets. Screenshots go in the run's `attachments/` for the Preview gate.
