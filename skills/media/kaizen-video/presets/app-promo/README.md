# app-promo

A product promo: the real product filmed in use, framed in its own devices, about 20-35 s at 9:16.

The video runs in this order:
1. **Hook:** 2-3 lines, lit word by word; the last word is in the brand accent.
2. **Name:** the product name and its tagline.
3. **Steps:** one recorded task each. One caption sits above the device, a tap mark shows on each tap, and
   the camera punches in on the control and back out.
4. **End card:** the logo fills up, the name wipes in, then the tagline and the call to action hold.

The device frames are:
- a phone, for mobile apps and PWAs;
- a browser window showing the real URL, for web apps;
- a titled app window, for native apps (from the user's recording);
- laptop and phone together, for a product that runs on both.

Colours, font and logo come from the product's brand, and work on a light or a dark ground.

Built by `scripts/make_promo.py` from `videos/<name>/promo.json` and the recordings that `scripts/record.mjs`
makes. See `references/promo.md`. Approved by the user on 2026-10-26 (the kaizen launch video).
