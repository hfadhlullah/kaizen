#!/usr/bin/env python3
"""Rebuild the README demo: python3 assets/make-demo.py

The transcript is the customer-email example from the README, revealed one line at a
time. Edit LINES here and re-run; the README shows the same text in full below it.
"""
from PIL import Image, ImageDraw, ImageFont

BG, INK, DIM = (12, 22, 47), (238, 242, 250), (150, 170, 205)
YOU, KAI, HIGH, LOW = (120, 200, 255), (130, 220, 160), (255, 120, 110), (230, 200, 110)
MONO = "/usr/share/fonts/noto/NotoSansMono-Regular.ttf"
SIZE, PAD, LEAD, W = 15, 24, 22, 800

# (speaker colour or None, text, line colour, ms to wait after showing it)
LINES = [
    (YOU, "you     /kaizen rewrite the onboarding email: new pricing starts on the 1st", INK, 900),
    (None, "", INK, 200),
    (KAI, "kaizen  Here is the plan.", INK, 500),
    (None, "        Done means:  a customer knows what changes, when, and what to do.", DIM, 350),
    (None, "        Wrong means: a claim we cannot stand behind.", DIM, 350),
    (None, "          1. Date and amount first", INK, 250),
    (None, "          2. One line on what happens if they do nothing", INK, 250),
    (None, "          3. Keep the sign-off and legal footer untouched", INK, 400),
    (None, "        Approve this plan?          [ approve ]  [ change something ]", INK, 1000),
    (None, "", INK, 200),
    (YOU, "you     approve", INK, 1200),
    (None, "", INK, 200),
    (KAI, "kaizen  Done, and reviewed. Two things found:", INK, 500),
    (None, "        1. paragraph 2   high  \"Your price will not change\" is untrue", HIGH, 250),
    (None, "                               for annual plans renewing after the 1st.", HIGH, 500),
    (None, "        2. subject line  low   14 words, cut off on mobile.", LOW, 600),
    (None, "        Fix them?           [ both ]  [ just 1 ]  [ leave it ]", INK, 5000),
]


def frame(n, font):
    img = Image.new("RGB", (W, PAD * 2 + 20 + LEAD * len(LINES)), BG)
    d = ImageDraw.Draw(img)
    for i, c in enumerate(((255, 95, 86), (255, 189, 46), (39, 201, 63))):
        d.ellipse((PAD + i * 18, 14, PAD + i * 18 + 10, 24), fill=c)
    for i, (who, text, colour, _) in enumerate(LINES[:n]):
        y = PAD + 20 + i * LEAD
        if who:
            word, rest = text[:8], text[8:]
            d.text((PAD, y), word, font=font, fill=who)
            d.text((PAD + d.textlength(word, font=font), y), rest, font=font, fill=colour)
        else:
            d.text((PAD, y), text, font=font, fill=colour)
    return img


font = ImageFont.truetype(MONO, SIZE)
frames = [frame(n, font) for n in range(1, len(LINES) + 1)]
frames[0].save("demo.gif", save_all=True, append_images=frames[1:],
               duration=[ms for *_, ms in LINES], loop=0, optimize=True)
