"""Install STATIC Playfair Display + Inter into ~/.local/share/fonts/story-deck/.

Variable-font builds (the [wght] files on Google Fonts) render large headlines greyed /
semi-transparent in some desktop viewers (LibreOffice). Static instances do not.
Needs: pip install fonttools (qa.sh's .venv works: .venv/bin/pip install fonttools).
Usage: python3 install_fonts.py
"""
import os
import subprocess
import tempfile
import urllib.request

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

RAW = "https://github.com/google/fonts/raw/main/ofl/"
SRC = {
    "pf": "playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf",
    "pfi": "playfairdisplay/PlayfairDisplay-Italic%5Bwght%5D.ttf",
    "in": "inter/Inter%5Bopsz,wght%5D.ttf",
    "ini": "inter/Inter-Italic%5Bopsz,wght%5D.ttf",
}
JOBS = [
    ("pf", "PlayfairDisplay-Regular", {"wght": 400}),
    ("pf", "PlayfairDisplay-Bold", {"wght": 700}),
    ("pfi", "PlayfairDisplay-Italic", {"wght": 400}),
    ("in", "Inter-Regular", {"wght": 400, "opsz": 14}),
    ("in", "Inter-Bold", {"wght": 700, "opsz": 14}),
    ("ini", "Inter-Italic", {"wght": 400, "opsz": 14}),
]

dest = os.path.expanduser("~/.local/share/fonts/story-deck/")
os.makedirs(dest, exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    for key, path in SRC.items():
        urllib.request.urlretrieve(RAW + path, f"{tmp}/{key}.ttf")
    for key, out, loc in JOBS:
        font = instantiateVariableFont(TTFont(f"{tmp}/{key}.ttf"), loc, updateFontNames=True, static=True)
        assert "fvar" not in font
        font.save(dest + out + ".ttf")
        print("installed", out)
subprocess.run(["fc-cache", "-f"], check=False)
