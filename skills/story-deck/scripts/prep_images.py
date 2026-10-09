"""Crop photos to the slide and bake in the dark cinematic grade.

Usage: python3 prep_images.py plan.json   (run from the deck folder; reads img/, writes bg/)

plan.json:
  {"backgrounds": {"s01": ["<photo id>", focusY, base, "left|right|bottom", strength]},
   "panels":      {"p1":  ["<photo id>", focusY, [w_px, h_px]]}}
  photo id = file name in img/ without .jpg. focusY 0..1 = vertical crop focus.
  base = overall darkening 0..1. strength = gradient darkness on the text side 0..1.
  Panel size must have the SAME ratio as its box on the slide (w_in/h_in); pptxgenjs
  "sizing" is ignored by Google Slides and stretches the photo.

pptxgenjs has no gradient fills, so the text-side shadow lives in the image.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageEnhance

W, H = 1800, 1273  # A5 landscape (210:148)
INK = (20, 17, 15)


def crop(im, w, h, focus_y):
    r = w / h
    if im.width / im.height > r:  # too wide: crop sides
        nw = int(im.height * r)
        x = (im.width - nw) // 2
        im = im.crop((x, 0, x + nw, im.height))
    else:  # too tall: crop around focus
        nh = int(im.width / r)
        y = int((im.height - nh) * focus_y)
        im = im.crop((0, y, im.width, y + nh))
    out = im.resize((w, h), Image.LANCZOS)
    assert abs(out.width / out.height - r) < 0.01
    return out


def grade(im):
    im = ImageEnhance.Color(im).enhance(0.75)  # mute colours, film look
    return Image.blend(im, Image.new("RGB", im.size, (60, 40, 20)), 0.08)


def overlay(im, base, side, strength):
    ink = Image.new("RGB", im.size, INK)
    im = Image.blend(im, ink, base)
    g = Image.linear_gradient("L")  # black top -> white bottom
    if side == "left":
        g = g.rotate(-90)
    elif side == "right":
        g = g.rotate(90)
    g = g.resize(im.size).point(lambda v: int(v * strength))
    return Image.composite(ink, im, g)


def main(plan_path):
    plan = json.loads(Path(plan_path).read_text())
    Path("bg").mkdir(exist_ok=True)
    for sid, (pid, fy, base, side, s) in plan.get("backgrounds", {}).items():
        im = Image.open(f"img/{pid}.jpg").convert("RGB")
        overlay(grade(crop(im, W, H, fy)), base, side, s).save(f"bg/{sid}.jpg", quality=85)
    for sid, (pid, fy, (pw, ph)) in plan.get("panels", {}).items():
        im = grade(crop(Image.open(f"img/{pid}.jpg").convert("RGB"), pw, ph, fy))
        Image.blend(im, Image.new("RGB", im.size, INK), 0.35).save(f"bg/{sid}.jpg", quality=85)
    print("ok")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "plan.json")
