#!/usr/bin/env python3
"""Rebuild the images from kaizen.jpg: python3 assets/make-images.py

The wordmark is the same ANSI-shadow art the installer prints, drawn rather than
screenshotted so it stays in step with the terminal.
"""
from PIL import Image, ImageDraw, ImageFont

BG, INK, DIM = (12, 22, 47), (238, 242, 250), (150, 170, 205)
BOX = (534, 510, 1514, 1424)          # the artwork inside the source's padding
MONO = "/usr/share/fonts/noto/NotoSansMono-Bold.ttf"
CJK = "/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc"
SANS = "/usr/share/fonts/liberation/LiberationSans-Regular.ttf"
SS = 3                                # draw at 3x, shrink once: no jagged edges

WORD = [
    "██╗  ██╗ █████╗ ██╗███████╗███████╗███╗   ██╗",
    "██║ ██╔╝██╔══██╗██║╚══███╔╝██╔════╝████╗  ██║",
    "█████╔╝ ███████║██║  ███╔╝ █████╗  ██╔██╗ ██║",
    "██╔═██╗ ██╔══██║██║ ███╔╝  ██╔══╝  ██║╚██╗██║",
    "██║  ██╗██║  ██║██║███████╗███████╗██║ ╚████║",
    "╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝╚═╝  ╚═══╝",
]


def tanuki(height):
    """The line art as an alpha mask. A crop would bring its own background,
    which is near the banner's colour but not equal, and shows as a box."""
    art = Image.open("kaizen.jpg").convert("L").crop(BOX)
    scale = height / art.height
    art = art.resize((int(art.width * scale), height), Image.LANCZOS)
    return art.point(lambda v: 0 if v < 60 else min(255, int((v - 60) * 255 / 120)))


def wordmark(draw, x, y, size):
    font = ImageFont.truetype(MONO, size)
    cw = ImageDraw.Draw(Image.new("RGB", (1, 1))).textlength("█", font=font)
    for r, row in enumerate(WORD):
        t = r / (len(WORD) - 1)
        col = (round(222 - t * 150), round(238 - t * 128), round(255 - t * 38))
        for i, ch in enumerate(row):
            if ch == " ":
                continue
            cx, cy = x + i * cw, y + r * size
            if ch == "█":
                # The block glyph stops short of its own cell and leaves seams
                # through the letters; a rectangle fills it exactly.
                draw.rectangle([cx, cy, cx + cw + 1, cy + size + 1], fill=col)
            else:
                draw.text((cx, cy), ch, font=font, fill=col)
    return cw * len(WORD[0]), size * len(WORD)


def banner():
    W, H, size = 1280 * SS, 420 * SS, 21 * SS
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    mask = tanuki(250 * SS)
    ww = ImageDraw.Draw(Image.new("RGB", (1, 1))).textlength(
        "█", font=ImageFont.truetype(MONO, size)) * len(WORD[0])
    gap = 60 * SS
    x0 = int((W - (mask.width + gap + ww)) / 2)
    im.paste(Image.new("RGB", mask.size, INK), (x0, (H - mask.height) // 2), mask)
    tx = x0 + mask.width + gap
    ty = int(H / 2 - size * len(WORD) / 2 - 20 * SS)
    _, wh = wordmark(d, tx, ty, size)

    cjk = ImageFont.truetype(CJK, 30 * SS)
    small = ImageFont.truetype(SANS, 24 * SS)
    sy = ty + wh + 26 * SS
    d.text((tx + 2, sy), "改善", font=cjk, fill=DIM)
    d.text((tx + 2 + d.textlength("改善", font=cjk) + 16 * SS, sy + 6 * SS),
           "continuous improvement", font=small, fill=DIM)
    im.resize((1280, 420), Image.LANCZOS).quantize(colors=64, dither=Image.Dither.NONE) \
      .save("kaizen-banner.png", "PNG", optimize=True)


def social():
    """1280x640 is near enough square that a wide layout loses its edges when
    GitHub crops the card, so this one stacks."""
    W, H, size = 1280 * SS, 640 * SS, 17 * SS
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    mask = tanuki(280 * SS)
    im.paste(Image.new("RGB", mask.size, INK), ((W - mask.width) // 2, 80 * SS), mask)
    cw = ImageDraw.Draw(Image.new("RGB", (1, 1))).textlength(
        "█", font=ImageFont.truetype(MONO, size))
    wordmark(d, int((W - cw * len(WORD[0])) / 2), 420 * SS, size)
    small = ImageFont.truetype(SANS, 26 * SS)
    sub = "plan  ·  approve  ·  build  ·  review"
    d.text(((W - d.textlength(sub, font=small)) / 2, 560 * SS), sub, font=small, fill=DIM)
    im.resize((1280, 640), Image.LANCZOS).quantize(colors=64, dither=Image.Dither.NONE) \
      .save("kaizen-social.png", "PNG", optimize=True)


def square():
    """Avatar and logo: the tanuki filling the frame, not the source's padding."""
    src = Image.open("kaizen.jpg").convert("RGB")
    cx, cy = (BOX[0] + BOX[2]) // 2, (BOX[1] + BOX[3]) // 2
    half = int(max(BOX[2] - BOX[0], BOX[3] - BOX[1]) / 0.78 / 2)
    crop = src.crop((cx - half, cy - half, cx + half, cy + half))
    flat = Image.new("RGB", crop.size, BG)
    flat.paste(crop, (0, 0))
    for size, name in [(1024, "kaizen-logo.png"), (460, "kaizen-avatar.png")]:
        flat.resize((size, size), Image.LANCZOS) \
            .quantize(colors=24, dither=Image.Dither.NONE) \
            .save(name, "PNG", optimize=True)


if __name__ == "__main__":
    banner(); social(); square()
    print("wrote kaizen-banner.png, kaizen-social.png, kaizen-logo.png, kaizen-avatar.png")
