"""Pixel art: a text grid and its palette into a crisp PNG, for mascots, icons and scene pictures.

    python3 scripts/pixel.py <art.txt> <out.png> [--scale N]

art.txt: palette lines "X #rrggbb" (or "X #rrggbbaa"), a blank line, then the grid, one character per pixel;
"." and any character not in the palette are transparent. Rows may differ in length (short rows are padded).
The grid is upscaled N times (default 32) with nearest-neighbour, so edges stay sharp.
"""
import sys
from PIL import Image


def render(text, scale=32):
    head, _, body = text.strip("\n").partition("\n\n")
    pal = {}
    for line in head.splitlines():
        k, v = line.split()
        v = v.lstrip("#")
        pal[k] = tuple(int(v[i:i + 2], 16) for i in range(0, len(v), 2)) + ((255,) if len(v) == 6 else ())
    rows = body.strip("\n").splitlines()
    img = Image.new("RGBA", (max(map(len, rows)), len(rows)), (0, 0, 0, 0))
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            if ch in pal:
                img.putpixel((x, y), pal[ch])
    return img.resize((img.width * scale, img.height * scale), Image.NEAREST)


if __name__ == "__main__":
    if sys.argv[1:] == ["--check"]:  # self-test
        im = render("R #ff0000\nB #0000ff80\n\nR.\n.B", 2)
        assert im.size == (4, 4) and im.getpixel((0, 0)) == (255, 0, 0, 255) and im.getpixel((2, 0))[3] == 0
        assert im.getpixel((3, 3)) == (0, 0, 255, 128) and im.getpixel((1, 1)) == (255, 0, 0, 255)
        print("ok")
        sys.exit()
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    scale = int(sys.argv[sys.argv.index("--scale") + 1]) if "--scale" in sys.argv else 32
    render(open(sys.argv[1]).read(), scale).save(sys.argv[2])
    print(f"wrote {sys.argv[2]}")
