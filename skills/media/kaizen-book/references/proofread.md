# Proofreading

There are two passes. The script checks structure and you read for language. Nothing is changed until the
author picks which items to accept.

## 1. Structure: `python3 $S/check_book.py book`

It reports chapter numbering gaps, footnote markers without notes and notes nobody cites, empty chapters
and headings, `##Heading` without a space, broken image paths, Word field codes and HTML leftovers,
soft hyphens, double spaces, space before punctuation, unclosed bold, mixed straight and curly quotes, and
repeated words. Errors stop the build; warnings are judgement calls. Fix errors that are mechanical
(a missing space after `##`) directly and list them. Anything that changes wording goes in the
change list below.

Also search for `[[CHECK:` markers left while drafting. Every one is an open question for the author.

## 2. Language: `book/proofread.md`

Read chapter by chapter, against `book/style.md`. Write numbered items, one per change:

```markdown
# Proofread — <title>, <date>
| # | Where | Original | Correction | Reason |
|---|---|---|---|---|
| 1 | Bab 3, ¶4 | "di karenakan" | "dikarenakan" | KBBI: prefix written together |
| 2 | Ch 7, ¶12 | "Marta" | "Martha" | style sheet spelling |
```

Look for:
- spelling and grammar in the book's language and standard: for Indonesian, KBBI and EYD (prefixes *di-*/*ke-* versus
  prepositions *di*/*ke*, capitalisation, italics for foreign words); for English, the US or UK choice in the style sheet;
- consistency with the style sheet: names, terms, transliterations, numbers, dates;
- continuity (fiction): a character who knows something before they learn it, timelines, a changed eye colour;
- facts (non-fiction): dates, names and quotes that disagree within the book;
- punctuation: dialogue quotes, dashes, ellipses, and missing or doubled full stops;
- footnote numbering and placement (the marker comes after the punctuation, unless the language's
  convention says otherwise).

Do not "improve" the author's style in a proofread. Changes of voice, wording or structure are a
separate edit, and only with the author's say-so. When a passage reads badly enough that you would rewrite it, list it as
a query ("Q:"), not a correction.

## 3. Apply

The author answers with the numbers to accept ("all except 4, 9", "1–20"). Apply exactly those, and
mark each item `✓ applied` or `✗ declined` in `proofread.md`, which becomes the change record (like an
editor's change list). Then run `check_book.py` again and rebuild.
