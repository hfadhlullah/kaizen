#!/usr/bin/env python3
"""Assemble a static site for the book: python3 deploy.py <book-dir> [--out output]

Writes <out>/deploy/: index.html (small page with link-preview tags that then loads the book),
reader.html (the book), the PDFs and og.jpg. Publish the folder with any static host,
e.g. `cd output/deploy && npx vercel --prod`.

Why the loader: WhatsApp and other link previewers give up on a multi-MB page before reading
its <head>, so the first response must be tiny and carry the og: tags itself.
"""
import html, json, os, shutil, sys

args = sys.argv[1:]
if not args or args[0].startswith("-"):
    sys.exit(__doc__)
cfg = json.load(open(os.path.join(args[0], "book.json")))
out = args[args.index("--out") + 1] if "--out" in args else "output"
src, dst = out, os.path.join(out, "deploy")
if not os.path.exists(os.path.join(src, "book.html")):
    sys.exit("error: %s/book.html missing; run build_book.py first" % src)
os.makedirs(dst, exist_ok=True)
shutil.copy(os.path.join(src, "book.html"), os.path.join(dst, "reader.html"))
copied = ["reader.html"]
for f in sorted(os.listdir(src)):
    if f.endswith(".pdf") or f == "og.jpg":
        shutil.copy(os.path.join(src, f), os.path.join(dst, f)); copied.append(f)

e = lambda s: html.escape(s or "", quote=True)
url = (cfg.get("url") or "").rstrip("/") + "/" if cfg.get("url") else ""
title = cfg["title"] + (" — " + cfg["subtitle"] if cfg.get("subtitle") else "")
desc = cfg.get("description") or cfg.get("tagline") or ""
og_img = ('\n<meta property="og:image" content="%sog.jpg">\n<meta property="og:image:width" content="1200">\n'
          '<meta property="og:image:height" content="630">\n<meta name="twitter:image" content="%sog.jpg">' % (e(url), e(url))) if url else ""
if not url:
    print("warning: book.json has no \"url\"; link previews need an absolute og:image URL", file=sys.stderr)
page = """<!DOCTYPE html>
<html lang="%(lang)s"><head>
<meta charset="utf-8">
<title>%(title)s</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="%(desc)s">
<meta property="og:type" content="book">
<meta property="og:title" content="%(title)s">
<meta property="og:description" content="%(desc)s">
<meta property="og:url" content="%(url)s">%(img)s
<meta name="twitter:card" content="summary_large_image">
</head><body style="margin:0;background:#111">
<noscript><a href="reader.html" style="color:#ddd">%(title)s</a></noscript>
<script>
// Small first response so link previews read the tags above; the book loads after.
fetch('reader.html').then(function (r) { return r.text(); }).then(function (h) {
  document.open(); document.write(h); document.close();
}).catch(function () { location.replace('reader.html'); });
</script>
</body></html>
""" % {"lang": e(cfg.get("lang", "en")), "title": e(title), "desc": e(desc), "url": e(url), "img": og_img}
open(os.path.join(dst, "index.html"), "w").write(page)
print("ok %s: index.html, %s" % (dst, ", ".join(copied)))
