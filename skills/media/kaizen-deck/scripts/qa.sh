#!/usr/bin/env bash
# Build a deck, check the file, render every slide, and write 2x4 contact sheets to qa/.
# Usage (from the deck folder): qa.sh build-x.js      -> prints the qa/sheet*.jpg paths to look at
# Uses the Anthropic pptx skill's validator when installed; otherwise a built-in structural check.
set -euo pipefail
BUILD=${1:?usage: qa.sh build-script.js}
"$(dirname "$0")/check.sh" >/dev/null 2>&1 || { "$(dirname "$0")/check.sh" 2>/dev/null || true; }
V=$HOME/.kaizen/decks/.venv
[ -x "$V/bin/python" ] || { python3 -m venv "$V" && "$V/bin/pip" -q install defusedxml lxml pillow fonttools "qrcode[pil]"; }
PY=$V/bin/python
F=$(node "$BUILD")
PPTX_SKILL=$(ls -d ~/.claude/skills/*/pptx/scripts ~/.claude/skills/synced/*/pptx/scripts 2>/dev/null | head -1 || true)
if [ -n "$PPTX_SKILL" ] && [ -f "$PPTX_SKILL/office/validate.py" ]; then
  $PY "$PPTX_SKILL/office/validate.py" "$F"
  $PY "$PPTX_SKILL/office/soffice.py" --headless --convert-to pdf "$F" >/dev/null
else
  # structural check: valid zip, every XML part parses, every slide relationship target exists
  $PY - "$F" <<'PYEOF'
import sys, zipfile, posixpath
from lxml import etree
z = zipfile.ZipFile(sys.argv[1]); bad = z.testzip()
assert bad is None, f"corrupt part: {bad}"
names = {n for n in z.namelist() if not n.endswith("/")}  # skip directory entries
for n in names:
    if n.endswith(".xml") or n.endswith(".rels"):
        etree.fromstring(z.read(n))
for n in names:
    if n.startswith("ppt/slides/_rels/"):
        for r in etree.fromstring(z.read(n)):
            t = r.get("Target")
            if r.get("TargetMode") == "External" or not t: continue
            p = posixpath.normpath(posixpath.join("ppt/slides", t))
            assert p in names, f"{n}: missing {p}"
print("structure OK:", sum(1 for n in names if n.startswith("ppt/slides/slide")), "slides")
PYEOF
  soffice --headless --convert-to pdf --outdir "$(dirname "$F")" "$F" >/dev/null 2>&1
fi
rm -rf qa && mkdir qa
pdftoppm -jpeg -r 70 "${F%.pptx}.pdf" qa/s
rm -f "${F%.pptx}.pdf"
$PY - <<'PYEOF'
from PIL import Image; import glob, os
ims=[Image.open(f) for f in sorted(glob.glob('qa/s-*.jpg'))]; w,h=ims[0].size
for p in range(0,len(ims),8):
    g=ims[p:p+8]; sh=Image.new('RGB',(w*2,h*4),'white')
    for i,im in enumerate(g): sh.paste(im,((i%2)*w,(i//2)*h))
    sh.save(f'qa/sheet{p//8}.jpg'); print(f'{os.getcwd()}/qa/sheet{p//8}.jpg')
PYEOF
