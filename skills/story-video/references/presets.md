# Presets (src/engine/presets.json)

| preset | use for | look & motion | audio | captions | loudness |
|---|---|---|---|---|---|
| cinematic-drama | pitch opener, brand film | dark, full-bleed photos, slow push-in, rise text, grain + vignette, fades | quiet music, hit on reveal, riser into the question, room tone | subtitle bar | −16 |
| promo-booth | exhibition loop, deck-faithful promo (the friend's style) | photo in a framed window beside the text, wipes, slide-in text, staged builds | whoosh on cuts, tick on titles, slightly louder music | subtitle bar | −16 |
| fun-energetic | social posts, parents, events | cream background, rounded photo cards that bounce in, pop text, light leaks | bright track (Carefree), pops and a chime | subtitle bar | −14 |
| viral-social | TikTok / Reels / Shorts (9:16) | full-bleed, fast punch-in cuts, bold Inter, strong Ken Burns | Easy Lemon-type track, whooshes | kinetic 2–3 words, accent on the spoken word | −14 |

Pace: `lead` / `tail` = silence before and after each line. Drama 0.8/1.1, booth 0.45/0.7, fun 0.2/0.35, viral 0.05/0.2.

## Writing for each preset
- **drama**: full story arc, 70–110 s, long pauses allowed.
- **booth**: the deck's beats in order, 80–100 s, must make sense when joined mid-loop; real contacts on the CTA.
- **fun**: 35–50 s, playful lines ("Kenal rasanya?"), one problem montage, three quick benefits.
- **viral**: ≤ 30 s, line 1 is the hook (a sharp, relatable pain), product by second ~12, one CTA.

## Adding a preset
Copy an entry in presets.json; fields: palette, fonts (Playfair Display / Inter / Fraunces are loaded —
add others in Film.tsx FONTS), pace, text (rise|slide|pop), transition (fade|wipe|punch),
layout (fullbleed|window|card), grade, captions (subtitle|kinetic|none), music levels, sfx names, kenburns, loudness.
