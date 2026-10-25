#!/usr/bin/env python3
"""Structure check for a manuscript: python3 check_book.py <book-dir> [--json]

Finds what a proofreader's eye skips: chapter numbering gaps, footnote markers without a note
(and notes nobody points to), empty chapters and headings, broken image paths, repeated words,
[[CHECK: …]] markers left while drafting, and leftovers from Word or copy-paste. Prints numbered findings as `line: [kind] message`.
Exit 1 when an error-level finding exists. Stdlib only.
"""
import json, os, re, sys

NUM_WORDS = {w: i for i, w in enumerate(
    "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen "
    "seventeen eighteen nineteen twenty".split())}
NUM_WORDS.update({w: i for i, w in enumerate(
    "nol satu dua tiga empat lima enam tujuh delapan sembilan sepuluh sebelas".split())})
ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100}


def roman(s):
    if not s or not re.fullmatch(r"[IVXLC]+", s):
        return None
    n = 0
    for a, b in zip(s, s[1:] + " "):
        v = ROMAN[a]; n += -v if b != " " and ROMAN.get(b, 0) > v else v
    return n


def chapter_no(title):
    """Number in 'Chapter 3', 'Bab 12', 'BAB IV', '3. Title', 'Chapter Three'; None when unnumbered."""
    m = re.match(r"^(?:chapter|bab|chapitre|kapitel|cap[ií]tulo|capitolo|fasal|fasl)\s+([\w]+)", title, re.I) or re.match(r"^(\d+)[.:)]?\s", title)
    if not m:
        return None
    w = m[1]
    return int(w) if w.isdigit() else roman(w.upper()) or NUM_WORDS.get(w.lower())


def check(book_dir):
    cfg = json.load(open(os.path.join(book_dir, "book.json")))
    path = os.path.join(book_dir, cfg.get("manuscript", "manuscript.md"))
    lines = open(path, encoding="utf-8").read().split("\n")
    F = []
    add = lambda ln, level, kind, msg: F.append({"line": ln, "level": level, "kind": kind, "msg": msg})

    chapters, cur, fence = [], None, False
    for i, raw in enumerate(lines, 1):
        s = raw.strip()
        if s.startswith("```"):
            fence = not fence
        if fence:
            continue
        h = re.match(r"^(#{1,6})(\s*)(.*)$", raw)
        if h and h[1]:
            if not h[2] and h[3]:
                add(i, "error", "heading", "'%s' needs a space after the #" % raw[:30])
            if not h[3].strip():
                add(i, "error", "heading", "empty heading")
            if len(h[1]) == 2 and h[2]:
                cur = {"line": i, "title": h[3].split(" | ")[0].strip(), "refs": [], "defs": {}, "words": 0}
                chapters.append(cur)
            if len(h[1]) == 1:
                cur = None
            continue
        if cur is not None:
            for m in re.finditer(r"\[\^([^\]]+)\](?!:)", raw):
                cur["refs"].append((m[1], i))
            d = re.match(r"^\[\^([^\]]+)\]:\s*(.*)", s)
            if d:
                if d[1] in cur["defs"]:
                    add(i, "error", "footnote", "note [^%s] defined twice in this chapter" % d[1])
                cur["defs"][d[1]] = i
                if not d[2].strip():
                    add(i, "error", "footnote", "note [^%s] is empty" % d[1])
            elif s:
                cur["words"] += len(s.split())
        for m in re.finditer(r"!\[[^\]]*\]\(([^)\s]+)\)", raw):
            if not re.match(r"^(https?:|data:)", m[1]) and not os.path.exists(os.path.join(book_dir, m[1])):
                add(i, "error", "image", "image not found: %s" % m[1])
        # leftovers from Word / copy-paste
        for m in re.finditer(r"\[\[CHECK:([^\]]*)\]\]", raw):
            add(i, "error", "check", "open question for the author:%s" % m[1])
        if "\u00ad" in raw: add(i, "warn", "leftover", "soft hyphen (U+00AD) — invisible, breaks search")
        if "\t" in raw and not raw.startswith("    "): add(i, "warn", "leftover", "tab character")
        if re.search(r"\S {2,}\S", raw): add(i, "warn", "spacing", "double space inside a line")
        if re.search(r"\s[,.;:!?](?!\.)", raw) and not re.search(r"\s\.\.\.", raw): add(i, "warn", "spacing", "space before punctuation")
        if re.search(r"<(span|font|o:p|div)[\s>]", raw, re.I): add(i, "warn", "leftover", "HTML from a word processor: %s" % re.search(r"<\w+[^>]*>", raw)[0][:40])
        if re.search(r"Error! (Bookmark|Reference)|MERGEFORMAT|\{\s*(PAGEREF|REF|TOC)\b", raw): add(i, "error", "leftover", "Word field code")
        if s.count("**") % 2 and not re.fullmatch(r"[*\s]+", s): add(i, "warn", "format", "unbalanced ** (bold not closed)")
        if re.search(r"[“”]", raw) and re.search(r'(?<![=\w])"', raw): add(i, "warn", "quotes", "straight and curly quotes mixed")
        for m in re.finditer(r"\b(\w{2,})\s+\1\b", raw, re.I):
            if m[1].lower() not in ("had", "that", "very", "is", "bye", "ha", "no", "so"): add(i, "warn", "repeat", "repeated word: '%s'" % m[0])

    if not chapters:
        add(1, "error", "structure", "no chapters: chapters start with '## '")
    nums = [(c, chapter_no(c["title"])) for c in chapters]
    numbered = [(c, n) for c, n in nums if n is not None]
    for (a, na), (b, nb) in zip(numbered, numbered[1:]):
        if nb != na + 1:
            add(b["line"], "error", "numbering", "'%s' follows '%s' (expected %d)" % (b["title"], a["title"], na + 1))
    titles = {}
    for c in chapters:
        if c["title"].lower() in titles:
            add(c["line"], "warn", "structure", "chapter title repeats line %d" % titles[c["title"].lower()])
        titles.setdefault(c["title"].lower(), c["line"])
        if c["words"] == 0:
            add(c["line"], "error", "structure", "chapter '%s' has no text" % c["title"])
        refs = [r for r, _ in c["refs"]]
        for r, ln in c["refs"]:
            if r not in c["defs"]:
                add(ln, "error", "footnote", "marker [^%s] has no note in this chapter" % r)
        for d, ln in c["defs"].items():
            if d not in refs:
                add(ln, "warn", "footnote", "note [^%s] is never referenced" % d)
    F.sort(key=lambda f: f["line"])
    return F, len(chapters)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    findings, n = check(sys.argv[1])
    if "--json" in sys.argv:
        print(json.dumps(findings, ensure_ascii=False, indent=1))
    else:
        for k, f in enumerate(findings, 1):
            print("%3d. line %d: [%s %s] %s" % (k, f["line"], f["level"], f["kind"], f["msg"]))
        e = sum(f["level"] == "error" for f in findings)
        print("%d chapters; %d errors, %d warnings" % (n, e, len(findings) - e))
    sys.exit(1 if any(f["level"] == "error" for f in findings) else 0)
