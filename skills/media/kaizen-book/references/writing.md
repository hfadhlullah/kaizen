# Writing the book

The order is: brief (approved) → outline (approved) → chapters in batches → proofread → build. Every
step leaves a file in `book/`, so another session or another tool can pick the book up where it stopped.

## Outline: `book/outline.md`

- Fiction: one entry per chapter, with title, POV character, what happens, what changes by the end of the chapter, and
  the hook into the next one. Mark the turning points: inciting incident (~10%), first turn (~25%),
  midpoint (~50%), crisis (~75%), climax and resolution.
- Non-fiction: one entry per chapter, with its claim or question, its sources, and what the reader takes away.
- Group the chapters into parts when the brief asks for parts. A part becomes `# Part title` in the manuscript.
- Show the outline and wait for approval. A rejected outline is revised, never "fixed while drafting".

## The style sheet: `book/style.md`

Start it with the outline and update it after every batch of chapters. This is what keeps chapter 20 consistent with chapter 2:

- Names and spellings: characters, places, invented words, titles and honorifics, transliterations (one
  system, used everywhere).
- Facts established so far: ages, eye colours, dates, who knows what and when.
- Voice rules: POV, tense, dialogue punctuation, how numbers are written, the spelling standard
  (KBBI/EYD for Indonesian, US or UK spelling for English).
- Words to avoid: the author's dislikes, anachronisms, and your own tics (see below).

## Drafting

- Write into `book/manuscript.md` in the format `build_book.py` reads:
  `# Part`, `## Chapter title | optional subtitle`, `### Section`, blank line between paragraphs,
  `> quote`, `- list`, `***` scene break, `![caption](images/file.jpg)`, footnote `[^1]` with
  `[^1]: note text` later in the same chapter.
- Write in batches of three to five chapters. After each batch, show a short summary of each chapter and what
  you changed in the style sheet, and stop for the author. They may want to steer before the next batch.
- Read `brief.md`, `style.md`, the outline entry, and the end of the previous chapter before writing a chapter.
  Don't reread the whole manuscript.
- Aim for the brief's chapter length. Report the word count per chapter and the running total.
- Prose: concrete over abstract, scenes over summary (fiction), one idea per paragraph (non-fiction).
  Vary sentence length. Dialogue carries subtext, and people rarely say exactly what they mean.
- Avoid the habits that mark machine prose: stacked adjectives, "a testament to", "tapestry",
  "delve", "in the realm of", "it's not X, it's Y", every chapter ending on a reflective one-liner,
  everyone "letting out a breath they didn't know they were holding". Put any you catch in the style sheet's
  avoid list.
- Facts in non-fiction: never invent a source, a quote, a date or a statistic. Anything the author's material
  does not support is marked `[[CHECK: …]]` for the author, and the structure check reports these
  markers until they are resolved.
- The author's own text is theirs. Edit it only as the brief allows (light copyedit, restructure, or
  rewrite), and say what kind of edit you made.

## Existing manuscripts

If the author already has a text, convert it with
`pandoc in.docx -t gfm --wrap=none --extract-media=book/images -o book/manuscript.md`. Then fix
the headings so parts are `#` and chapters are `##`, and go straight to proofreading.
