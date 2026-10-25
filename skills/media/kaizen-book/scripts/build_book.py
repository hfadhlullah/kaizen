#!/usr/bin/env python3
"""Build a single-file e-book reader from book/manuscript.md + book/book.json.

Usage: python3 build_book.py <book-dir> [--out output] [--no-fonts]
Writes <out>/book.html. Stdlib only. Run pdf.mjs afterwards for the PDFs.
"""
import base64, html, json, mimetypes, os, re, sys, urllib.request

SKILL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

LABELS = {
    "id": {"start": "Mulai Membaca", "resume": "Lanjutkan", "contents": "Daftar Isi", "cover": "Sampul",
           "tap": "Ketuk untuk membuka", "settings": "Pengaturan tampilan", "theme": "Tema", "size": "Ukuran huruf",
           "light": "Kertas", "sepia": "Sepia", "night": "Malam", "print": "Cetak / PDF", "notes": "Catatan",
           "page": "hlm.", "by": "oleh", "close": "Tutup", "prev": "Sebelumnya", "next": "Berikutnya"},
    "en": {"start": "Start Reading", "resume": "Continue", "contents": "Contents", "cover": "Cover",
           "tap": "Tap to open", "settings": "Display settings", "theme": "Theme", "size": "Text size",
           "light": "Paper", "sepia": "Sepia", "night": "Night", "print": "Print / PDF", "notes": "Notes",
           "page": "p.", "by": "by", "close": "Close", "prev": "Previous", "next": "Next"},
}

# ---------------------------------------------------------------- Markdown

def inline(s, ch):
    """Inline Markdown to HTML. `ch` collects footnote refs for this chapter."""
    out, pos = [], 0
    code = re.compile(r"`([^`]+)`")
    parts = code.split(s)
    for i, p in enumerate(parts):
        if i % 2:
            out.append("<code>%s</code>" % html.escape(p))
            continue
        p = html.escape(p, quote=False)
        p = re.sub(r"!\[([^\]]*)\]\(([^)\s]+)\)", lambda m: '<img alt="%s" src="%s">' % (m[1], ch["img"](m[2])), p)
        p = re.sub(r"\[\^([^\]]+)\]", lambda m: ch["ref"](m[1]), p)
        p = re.sub(r"\[([^\]]+)\]\(([^)\s]+)\)", r'<a href="\2" target="_blank" rel="noopener">\1</a>', p)
        p = re.sub(r"\*\*(.+?)\*\*|__(.+?)__", lambda m: "<strong>%s</strong>" % (m[1] or m[2]), p)
        p = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)|(?<![\w_])_(?!\s)(.+?)(?<!\s)_(?!\w)",
                   lambda m: "<em>%s</em>" % (m[1] or m[2]), p)
        p = re.sub(r"(  |\\)\n", "<br>", p)
        out.append(p)
    return "".join(out)


def parse(text, book_dir):
    """Returns {"intro": html, "parts": [{"title", "intro", "chs": [{"t", "sub", "html"}]}]}."""
    text = text.replace("\r\n", "\n").lstrip("﻿")
    lines = text.split("\n")
    parts = [{"title": None, "intro": "", "chs": []}]
    cur = {"buf": [], "notes": {}, "order": []}

    def img(src):
        if re.match(r"^(https?:|data:)", src):
            return src
        path = os.path.join(book_dir, src)
        if not os.path.exists(path):
            print("warning: image not found: %s" % src, file=sys.stderr)
            return src
        if os.path.getsize(path) > 1_500_000:
            print("warning: %s is %.1f MB; resize it to keep the book light" % (src, os.path.getsize(path) / 1e6), file=sys.stderr)
        mime = mimetypes.guess_type(path)[0] or "image/jpeg"
        return "data:%s;base64,%s" % (mime, base64.b64encode(open(path, "rb").read()).decode())

    chap_no = [0]

    def ref(key):
        if key not in cur["order"]:
            cur["order"].append(key)
        n = cur["order"].index(key) + 1
        return '<sup class="fn"><a href="#" data-fn="%d">%d</a></sup>' % (n, n)

    ctx = {"img": img, "ref": ref}

    def flush():
        """Render the buffered block lines into the current chapter (or part intro)."""
        blocks, block, code = [], [], None
        for ln in cur["buf"]:
            if code is not None:  # inside ``` … ```: keep every line, blank ones too
                if ln.strip().startswith("```"):
                    blocks.append(code); code = None
                else:
                    code.append(ln)
            elif ln.strip().startswith("```"):
                if block:
                    blocks.append(block); block = []
                code = ["\0code"]
            elif ln.strip() == "":
                if block:
                    blocks.append(block); block = []
            else:
                block.append(ln)
        for b in (block, code):
            if b:
                blocks.append(b)
        out = []
        for b in blocks:
            if b[0] == "\0code":
                out.append("<pre><code>%s</code></pre>" % html.escape("\n".join(b[1:])))
                continue
            first = b[0].strip()
            joined = "\n".join(x.strip() for x in b)
            if re.match(r"^\[\^[^\]]+\]:", first):
                key = None
                for x in b:
                    m = re.match(r"^\[\^([^\]]+)\]:\s*(.*)", x.strip())
                    if m:
                        key = m[1]; cur["notes"][key] = m[2]
                    elif key:
                        cur["notes"][key] += " " + x.strip()
                continue
            if re.match(r"^(\*\s*\*\s*\*|-{3,}|\*{3,}|⁂)$", first) and len(b) == 1:
                out.append('<p class="scene">⁂</p>')
            elif first.startswith("### ") or first.startswith("#### "):
                lvl = 3 if first.startswith("### ") else 4
                out.append("<h%d>%s</h%d>" % (lvl, inline(first[lvl + 1:].strip(), ctx), lvl))
                rest = b[1:]
                if rest:
                    out.append('<p dir="auto">%s</p>' % inline("\n".join(rest), ctx))
            elif first.startswith(">"):
                inner = "\n".join(re.sub(r"^>\s?", "", x.strip()) for x in b)
                paras = [p for p in re.split(r"\n\s*\n", inner) if p.strip()]
                out.append("<blockquote>%s</blockquote>" % "".join('<p dir="auto">%s</p>' % inline(p, ctx) for p in paras))
            elif re.match(r"^([-*+]|\d+[.)])\s", first):
                ordered = bool(re.match(r"^\d", first))
                items, it = [], None
                for x in b:
                    m = re.match(r"^\s*([-*+]|\d+[.)])\s+(.*)", x)
                    if m:
                        it = [m[2]]; items.append(it)
                    elif it is not None:
                        it.append(x.strip())
                tag = "ol" if ordered else "ul"
                out.append("<%s>%s</%s>" % (tag, "".join('<li dir="auto">%s</li>' % inline("\n".join(i), ctx) for i in items), tag))
            elif re.match(r"^!\[[^\]]*\]\([^)]+\)$", joined):
                m = re.match(r"^!\[([^\]]*)\]\(([^)]+)\)$", joined)
                cap = '<figcaption>%s</figcaption>' % inline(m[1], ctx) if m[1] else ""
                out.append('<figure><img alt="%s" src="%s">%s</figure>' % (html.escape(m[1]), img(m[2]), cap))
            elif first.startswith("<"):
                out.append(joined)
            else:
                out.append('<p dir="auto">%s</p>' % inline("\n".join(x.rstrip(" ") if not x.endswith("  ") else x for x in b), ctx))
        cur["buf"] = []
        if cur["order"]:
            notes = "".join('<li data-n="%d">%s</li>' % (i + 1, inline(cur["notes"].get(k, "<em>?</em>"), ctx))
                            for i, k in enumerate(cur["order"]))
            out.append('<ol class="notes">%s</ol>' % notes)
        return "".join(out)

    target = ("intro", parts[0])
    in_fence = False

    def close():
        body = flush()
        kind, obj = target
        if kind == "intro":
            obj["intro"] += body
        else:
            obj["html"] += body
        cur["notes"], cur["order"] = {}, []

    for ln in lines:
        if ln.strip().startswith("```"):
            in_fence = not in_fence
            cur["buf"].append(ln)
            continue
        m = re.match(r"^(#{1,2})\s+(.*)$", ln) if not in_fence else None
        if m:
            close()
            title = m[2].strip()
            if m[1] == "#":
                p = {"title": title, "intro": "", "chs": []}
                if parts[-1]["title"] is None and not parts[-1]["chs"] and not parts[-1]["intro"]:
                    parts[-1] = p
                else:
                    parts.append(p)
                target = ("intro", p)
            else:
                t, _, sub = title.partition(" | ")
                c = {"t": t.strip(), "sub": sub.strip(), "html": ""}
                parts[-1]["chs"].append(c)
                target = ("ch", c)
            continue
        cur["buf"].append(ln)
    close()
    return [p for p in parts if p["title"] or p["chs"] or p["intro"]]

# ---------------------------------------------------------------- Fonts

def embed_fonts(families, cache):
    """Google Fonts CSS with latin/latin-ext woff2 inlined, cached on disk. '' on failure (falls back to <link>)."""
    os.makedirs(cache, exist_ok=True)
    key = re.sub(r"\W+", "_", "-".join(families)) + ".css"
    path = os.path.join(cache, key)
    if os.path.exists(path):
        return open(path).read()
    q = "&".join("family=" + f.replace(" ", "+") + ":ital,wght@0,400;0,600;0,700;1,400" for f in families)
    url = "https://fonts.googleapis.com/css2?%s&display=swap" % q
    ua = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130 Safari/537.36"}
    try:
        try:
            css = urllib.request.urlopen(urllib.request.Request(url, headers=ua), timeout=20).read().decode()
        except Exception:  # a family without italics or weight 600/700
            q = "&".join("family=" + f.replace(" ", "+") for f in families)
            url = "https://fonts.googleapis.com/css2?%s&display=swap" % q
            css = urllib.request.urlopen(urllib.request.Request(url, headers=ua), timeout=20).read().decode()
        keep = []
        for sub, block in re.findall(r"/\* ([\w-]+) \*/\s*(@font-face\s*{[^}]*})", css):
            if sub not in ("latin", "latin-ext"):
                continue
            def inl(m):
                data = urllib.request.urlopen(urllib.request.Request(m[1], headers=ua), timeout=30).read()
                return "url(data:font/woff2;base64,%s)" % base64.b64encode(data).decode()
            keep.append(re.sub(r"url\((https://[^)]+)\)", inl, block))
        out = "\n".join(keep)
        open(path, "w").write(out)
        return out
    except Exception as e:
        print("warning: fonts not embedded (%s); the book loads them online instead" % e, file=sys.stderr)
        return ""

# ---------------------------------------------------------------- Build

def main():
    args = sys.argv[1:]
    if not args or args[0].startswith("-"):
        sys.exit(__doc__)
    book_dir = args[0]
    out_dir = args[args.index("--out") + 1] if "--out" in args else "output"
    cfg = json.load(open(os.path.join(book_dir, "book.json")))
    styles = json.load(open(os.path.join(SKILL, "assets", "styles.json")))
    style = dict(styles.get(cfg.get("style", "classic"), styles["classic"]))
    for k, v in cfg.get("theme", {}).items():  # per-book overrides
        style[k] = {**style[k], **v} if isinstance(v, dict) and isinstance(style.get(k), dict) else v
    lang = cfg.get("lang", "en")
    labels = {**LABELS.get(lang, LABELS["en"]), **cfg.get("labels", {})}

    parts = parse(open(os.path.join(book_dir, cfg.get("manuscript", "manuscript.md"))).read(), book_dir)
    if not any(p["chs"] for p in parts):
        sys.exit("error: no chapters found; chapters start with '## '")

    cover = None
    if cfg.get("cover"):
        p = os.path.join(book_dir, cfg["cover"])
        if os.path.exists(p):
            cover = "data:%s;base64,%s" % (mimetypes.guess_type(p)[0] or "image/jpeg", base64.b64encode(open(p, "rb").read()).decode())
        else:
            print("warning: cover not found: %s; using a typeset cover" % cfg["cover"], file=sys.stderr)

    fams = list(dict.fromkeys(style["fonts"].values()))
    font_css = "" if "--no-fonts" in args else embed_fonts(fams, os.path.join(os.path.expanduser("~"), ".kaizen", "kaizen-book", "fonts"))
    font_link = "" if font_css else '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?%s&display=swap">' % "&".join(
        "family=" + f.replace(" ", "+") for f in fams)

    data = {
        "title": cfg["title"], "subtitle": cfg.get("subtitle", ""), "author": cfg.get("author", ""),
        "tagline": cfg.get("tagline", ""), "edition": cfg.get("edition", ""), "lang": lang,
        "key": cfg.get("id") or re.sub(r"\W+", "-", cfg["title"].lower()).strip("-"),
        "cover": cover, "style": style, "labels": labels, "parts": parts,
        "dedication": cfg.get("dedication", ""), "copyright": cfg.get("copyright", ""),
        "volumes": cfg.get("volumes", []),
        "volume_print": cfg.get("volume_print", "mono"),
    }
    tpl = open(os.path.join(SKILL, "assets", "reader.html")).read()
    js = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    out = (tpl.replace("/*@@FONTS@@*/", font_css)
              .replace("<!--@@FONTLINK@@-->", font_link)
              .replace("@@LANG@@", html.escape(lang))
              .replace("@@TITLE@@", html.escape(cfg["title"]))
              .replace("@@DESC@@", html.escape(cfg.get("description") or cfg.get("tagline", "")))
              .replace('"@@BOOK@@"', js))
    os.makedirs(out_dir, exist_ok=True)
    dest = os.path.join(out_dir, "book.html")
    open(dest, "w").write(out)
    n = sum(len(p["chs"]) for p in parts)
    print("ok %s — %d parts, %d chapters, %.1f MB" % (dest, len([p for p in parts if p["title"]]), n, len(out.encode()) / 1e6))


if __name__ == "__main__":
    main()
