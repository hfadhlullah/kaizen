# Game art: prompts and file names

Drop files in this folder. The Game page (`kaizen web`, then `/game`) picks them up on the next
refresh; anything missing keeps the drawn placeholder. Allowed: `png`, `webp`, `jpg`, `svg`;
lowercase letters, digits and `-` in the name. This folder is not part of the npm package.

| File | What | Size | Background |
|---|---|---|---|
| `hero.png` | The character portrait | 900×1200 (3:4) | Any; it is cropped to fit a frame |
| `backdrop.jpg` | Page background, shown under a veil | 1920×1080 | Full scene |
| `guild-code.png` `guild-arts.png` `guild-writing.png` `guild-research.png` `guild-operations.png` `guild-media.png` `guild-commerce.png` `guild-craft.png` | Guild emblems, shown at 40 px | 512×512 | Transparent |

## Style line (paste into every prompt)

> Realistic fantasy, painterly 3D render look, warm candlelight, aged parchment and brass, deep
> navy night tones, rich gold highlights (#d9a62e), dark brown ink (#2c1d0e). No text, no letters,
> no watermark, no logo.

## hero.png

> Portrait of a fantasy adventurer, half-length, facing slightly left, calm confident look, simple
> travelling cloak over a scholar's tunic, a satchel strap and a small brass lantern at the belt.
> Neutral human, no species features. Soft rim light, dark moody dungeon-library background, head
> and shoulders centred with room above. 3:4 portrait. [style line]

The page shows one fixed image, so the hair, skin and eye colours stored in `~/.kaizen/game.json`
no longer change it. Say if you want a few variants (`hero-light.png` and so on) instead.

## backdrop.jpg

> Wide empty fantasy guild hall at dusk, stone arches, bookshelves, hanging lanterns, a distant
> doorway glowing gold, large calm areas with little detail so text stays readable on top.
> 16:9, no people. [style line]

## Guild emblems (one prompt each, transparent background)

Template:

> Circular heraldic emblem of the [GUILD], embossed brass and gold on a dark shield medallion,
> symbol: [SYMBOL]. Single centred icon, readable at 40 px, bold shapes, transparent background.
> Square 1:1. [style line]

| File | GUILD | SYMBOL |
|---|---|---|
| `guild-code` | Guild of Code | a glowing rune-carved cog with angle brackets |
| `guild-arts` | Guild of Arts | a quill crossed with a paintbrush over a prism |
| `guild-writing` | Guild of Writing | an open book with a feather quill |
| `guild-research` | Guild of Research | a magnifying lens over a star map |
| `guild-operations` | Guild of Operations | a ship's wheel with a keyhole at its centre |
| `guild-media` | Guild of Media | a film reel framed by a crescent moon |
| `guild-commerce` | Guild of Commerce | balance scales holding a gold coin |
| `guild-craft` | Guild of Craft | an anvil with a hammer and a small gear |

Keep all eight in one set: same frame, same lighting, same metal, only the symbol changes. Make
them in one session, or give the first result as a style reference for the rest.
