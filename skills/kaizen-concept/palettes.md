# Palettes and type pairings

Read at step 3 (to deal starting looks next to the references) and at step 5 (to give each concept its colour reason and type pairing). A palette here is a starting point. It never replaces a brand's own colours, and a colour change alone never makes a new concept (`SKILL.md`, the test for a real variant).

Thirty palettes and twenty type pairings follow. Pick from them by what the product is and how it should feel, not by taste on the day. Two concepts in one set never share a palette family or a type pairing.

## Roles

Every palette has six colours and each has one written job. Put them in `:root` as tokens and use nothing else.

- **bg:** the page. Tinted toward the accent's hue, never plain white or plain grey.
- **surface:** cards, sheets, inputs. Lighter than bg on light palettes, lighter than bg on dark ones too.
- **ink:** body text and headings.
- **muted:** labels, hints, meta. Smaller jobs only.
- **accent:** the action colour: primary buttons, links, the selected state. One job, so it stays rare.
- **on accent:** the text colour inside an accent button.

Status colours (error, success, warning) are not in the palettes. Take them from a separate small set, and check each against bg at 4.5:1 for text.

## Contrast result

Every pair below was computed with a small script: ink on bg, ink on surface, muted on bg, muted on surface, accent on bg, accent on surface (so accent works as link text), and on accent on accent. The lowest ratio in the whole set is 4.61:1, so every pair clears 4.5:1. If you change any value, run the check again. A tweak that looks small can drop a pair under the line.

```python
def lum(h):
    c=[int(h[i:i+2],16)/255 for i in (1,3,5)]
    c=[v/12.92 if v<=.03928 else ((v+.055)/1.055)**2.4 for v in c]
    return .2126*c[0]+.7152*c[1]+.0722*c[2]
def ratio(a,b):
    x,y=sorted((lum(a),lum(b)),reverse=True)
    return (x+.05)/(y+.05)
```

## Light palettes

| Name | bg | surface | ink | muted | accent | on accent | Suits | Not for |
|---|---|---|---|---|---|---|---|---|
| Linen Ledger | `#F6F3EE` | `#FFFFFF` | `#23201C` | `#6B645B` | `#1F5C4D` | `#FFFFFF` | bookkeeping, invoices, small-business finance | playful or youth products |
| Harbor Fog | `#EEF2F4` | `#FFFFFF` | `#17242B` | `#566A75` | `#0F6A8C` | `#FFFFFF` | logistics, ports, B2B dashboards | food, beauty, warm local brands |
| Clay Market | `#F7EFE7` | `#FFF9F3` | `#2E1F17` | `#7A5F4F` | `#B3441F` | `#FFFFFF` | local markets, ceramics, food stalls | banks, medical tools |
| Mint Clinic | `#EFF7F4` | `#FFFFFF` | `#10261F` | `#4F6F64` | `#0B7A5E` | `#FFFFFF` | clinics, wellness, health tracking | finance, nightlife |
| Paper Plum | `#F7F2F6` | `#FFFFFF` | `#2A1630` | `#76607C` | `#7A2A8F` | `#FFFFFF` | creative tools, learning apps, community products | heavy industry, government |
| Signal Orange | `#FAF6F1` | `#FFFFFF` | `#1E1A17` | `#6A625A` | `#C2410C` | `#FFFFFF` | logistics alerts, field work, delivery | calm wellness or luxury |
| Cobalt Desk | `#F4F6FB` | `#FFFFFF` | `#111A33` | `#55618A` | `#2748C7` | `#FFFFFF` | B2B software, admin panels, analytics | food, kids, craft |
| Rice Field | `#F3F5EA` | `#FCFDF6` | `#1D2616` | `#5E6B50` | `#3F6B1B` | `#FFFFFF` | agriculture, eco products, nutrition | fintech, gaming |
| Dawn Rose | `#FBF1F0` | `#FFFFFF` | `#33171A` | `#82595C` | `#B3243B` | `#FFFFFF` | beauty, florals, weddings, gifts | engineering tools |
| Sand Dune | `#F5EEDD` | `#FFFAEC` | `#2B2415` | `#75684C` | `#8A5A00` | `#FFFFFF` | travel, heritage, hospitality | dark-mode dev tools |
| Slate Quiet | `#F2F3F5` | `#FFFFFF` | `#1B1E24` | `#5F6672` | `#3D4A63` | `#FFFFFF` | law, consulting, serious B2B | youth and fun |
| Berry Pop | `#FFF4F7` | `#FFFFFF` | `#2B1020` | `#7B4F68` | `#C21873` | `#FFFFFF` | fashion, streaming, social apps | compliance, medical |
| Lime Lab | `#F7FAEC` | `#FFFFFF` | `#17200A` | `#58663F` | `#4C7A00` | `#FFFFFF` | fitness, habit apps, sustainability | luxury, legal |
| Tea House | `#F1F4EC` | `#FAFCF6` | `#1C2A1E` | `#5B6C5C` | `#2F6B4A` | `#FFFFFF` | tea, cafes, slow living | tech launches |
| Ink Paper | `#FAFAF7` | `#FFFFFF` | `#111111` | `#5C5C57` | `#B4231A` | `#FFFFFF` | news, long reading, editorial | kids, playful tools |
| Sky School | `#EEF6FD` | `#FFFFFF` | `#10283D` | `#4F6F8C` | `#1B6CC4` | `#FFFFFF` | schools, learning, public services | luxury, nightlife |
| Peach Soda | `#FFF2EA` | `#FFFFFF` | `#33170C` | `#85563F` | `#BE4912` | `#FFFFFF` | food delivery, casual consumer apps | B2B back office |
| Teal Ward | `#EDF6F6` | `#FFFFFF` | `#0F2729` | `#4B6E70` | `#0A7377` | `#FFFFFF` | health records, care teams, insurance | gaming |
| Gold Vault | `#F8F4EA` | `#FFFDF7` | `#25200F` | `#6F6540` | `#896800` | `#FFFFFF` | wealth, jewellery, notary | student and kids products |
| Violet Hour | `#F5F3FC` | `#FFFFFF` | `#1D1637` | `#625A88` | `#5B3FD1` | `#FFFFFF` | AI tools, creative studios, productivity | farm, heritage, food |

## Dark palettes

Dark does not mean black. The surfaces step up in lightness, so cards read as raised without a shadow. The accent is lighter than on light palettes, and the text on it is near-black.

| Name | bg | surface | ink | muted | accent | on accent | Suits | Not for |
|---|---|---|---|---|---|---|---|---|
| Night Terminal | `#0D1117` | `#161C25` | `#E6EBF2` | `#9AA6B8` | `#5CC8FF` | `#0B0B0B` | developer tools, CLIs, observability | wellness, kids |
| Ember Dark | `#16120F` | `#211B17` | `#F2E9E1` | `#B1A194` | `#FF8A4C` | `#0B0B0B` | media players, cooking, craft tools | medical or legal |
| Deep Forest | `#0E1712` | `#16231B` | `#E4EFE7` | `#9DB4A4` | `#6BD693` | `#0B0B0B` | finance, nature, trading with a calm tone | fashion, food delivery |
| Midnight Plum | `#15101C` | `#1F1829` | `#EEE7F6` | `#B2A4C6` | `#C79BFF` | `#0B0B0B` | music, nightlife, creative apps | B2B back office |
| Ocean Floor | `#0A1620` | `#112331` | `#E3EEF6` | `#93AFC4` | `#4FD1E8` | `#0B0B0B` | maps, marine, monitoring | fashion, heritage |
| Graphite Rose | `#171416` | `#221E21` | `#F3ECEE` | `#B7A9AE` | `#FF7A93` | `#0B0B0B` | journals, dating, social | engineering tools |
| Brass Night | `#14120C` | `#1F1C13` | `#F1EBD9` | `#B3A982` | `#E7B84A` | `#0B0B0B` | hospitality, whisky, premium services | kids, public services |
| Mono Studio | `#101010` | `#1A1A1A` | `#F0F0F0` | `#A3A3A3` | `#FFFFFF` | `#0B0B0B` | cameras, portfolios, design tools | anything that needs colour to carry meaning |
| Cherry Stage | `#190F12` | `#251619` | `#F6E9EB` | `#BE9FA5` | `#FF5A72` | `#0B0B0B` | events, ticketing, live shows | calm health products |
| Blueprint Dark | `#0B1426` | `#122038` | `#E4EBFA` | `#96A6C8` | `#7AA2FF` | `#0B0B0B` | engineering, construction, internal tools | beauty and food |

## Colour strategy

Choose how much of the screen the accent owns, and say it in the concept card. The share is measured on a screenshot, not guessed.

| Strategy | Accent share | What it looks like | Good for |
|---|---|---|---|
| Restrained | under 5% | Tinted neutrals do all the work. The accent marks the one action and the selected item. | Admin, finance, tools used for hours |
| Committed | 30 to 60% | One colour carries large areas: a header band, hero ground, key cards. Neutrals fill the rest. | A brand with one strong colour, consumer products |
| Full | several colours, each with a job | Three or four colours, each tied to a meaning, such as one per category. | Kids, learning, playful tools |
| Drenched | the whole page | The ground is the colour, and ink is chosen for it. | A landing page or campaign with a single mood |

Rules that hold in every strategy:

- Text on a coloured ground is tinted from that ground, never grey. Check it again after the tint.
- Two accents fight. In restrained and committed palettes, use one.
- Violet is a colour like any other. It needs a reason from the product. "AI products look purple" is not a reason.
- Large areas of the accent need the full contrast check with the text that sits on them, not only the button.
- Dark and light versions of one concept use the same hue family, with the accent re-checked in each.

## Fitting a palette to a brand's logo

When the user gives a logo or brand colours, they win. Use the palettes to build the rest.

1. Read the logo's one or two main colours. Name their jobs: one becomes the accent, the other becomes a second colour or stays in the logo only.
2. If the main colour is too light for text (a yellow, a light green), keep it for large fills and the logo. Pick a darker step of the same hue for links and buttons that carry text, and test it against bg.
3. Pick the palette whose bg hue sits next to the logo hue, then swap its accent for the brand's. Tint bg and surface toward the brand hue by a few percent, so the logo sits on a ground that belongs to it.
4. Put the real logo on bg, on surface and on the accent. If it disappears on one, use the brand's reversed version there.
5. Re-run the contrast check on every pair that changed, and write the final values as tokens.
6. Keep the logo's colours out of status states. A red logo does not make red a safe error colour next to a red button.

## Type pairings

All twenty are on Google Fonts, so a prototype loads them from one stylesheet link and stays free to use. Load at most two families, plus one mono when the product shows code or figures. Load only the weights used. Body text is at least 16px.

Inter stays fine as body text in an app. Use it as a display face only with a reason from the concept. Pairings where Inter is the body are marked.

| # | Display | Body | Mono | Mood and product | Not for |
|---|---|---|---|---|---|
| 1 | Fraunces | Source Sans 3 | none | Warm, local, craft shops, food, community | Terminals, dense data |
| 2 | Newsreader | Work Sans | none | Reading, essays, journalism, learning | Gaming, fast consumer apps |
| 3 | Bricolage Grotesque | Instrument Sans | none | Confident studios, creative services | Courts, banks |
| 4 | JetBrains Mono | IBM Plex Sans | JetBrains Mono | Developer tools, CLIs, observability | Beauty, children |
| 5 | Playfair Display | Inter | none | Premium, hospitality, jewellery (Inter body) | Dense admin screens |
| 6 | DM Serif Display | Karla | none | Boutique retail, cafes, gifts | Engineering tools |
| 7 | Manrope | Inter | none | Fintech, B2B dashboards, clean SaaS (Inter body) | Heritage, craft |
| 8 | Sora | Nunito Sans | none | Modern consumer apps, health and habit | Legal, formal letters |
| 9 | Libre Baskerville | Source Sans 3 | none | Law, notaries, institutions, long documents | Playful and youth products |
| 10 | Outfit | Nunito Sans | none | Friendly apps, onboarding, learning for adults | Luxury, heavy B2B |
| 11 | Fredoka | Nunito | none | Kids, schools, games with a soft tone | Anything serious or financial |
| 12 | Syne | Instrument Sans | none | Bold culture, events, music, portfolios | Medical and public services |
| 13 | Young Serif | Figtree | none | Friendly editorial, newsletters, community | Dashboards |
| 14 | Epilogue | Inter | none | Startup product pages with attitude (Inter body) | Quiet wellness |
| 15 | Lora | Merriweather Sans | none | Stories, nonprofits, culture, museums | Fast tools |
| 16 | IBM Plex Serif | IBM Plex Sans | IBM Plex Mono | Institutions, engineering firms, research | Fashion, nightlife |
| 17 | Unbounded | Inter | none | Loud, techy launches, crypto-adjacent, games (Inter body) | Reading and care |
| 18 | Cormorant Garamond | Jost | none | Luxury, fashion, wedding, spa | Dense UI, small text |
| 19 | Barlow Condensed | Barlow | none | Sport, fitness, logistics, signage | Gentle wellness |
| 20 | Atkinson Hyperlegible Next | Atkinson Hyperlegible Next | none | Accessibility first, public services, elderly users | Highly stylised brands |

Notes on using a pairing:

- Display faces with character carry headings only. Set them at 400 to 600 and give headings `text-wrap: balance`.
- Make the step from body to heading at least 1.25x at every level, or the hierarchy goes flat.
- Use tabular numbers for any figure that changes or lines up.
- For Bahasa Indonesia, every pairing above covers the Latin letters it needs. Check any pairing against the user's real strings, including long compound words, before you trust a heading size.
- For other scripts (Arabic, Devanagari, Thai, CJK), a Noto family fits the script. Pair it with a display face only if the display face supports the script too.
- A pairing is chosen because it tells the concept's promise. If two concepts can swap pairings without anyone noticing, one of them is wrong.

## Matching a palette to a mood

Starting points from `SKILL.md`'s mood table, now with names.

| Mood | Palettes to try | Strategy | Pairings to try |
|---|---|---|---|
| Enterprise | Cobalt Desk, Slate Quiet, Linen Ledger | Restrained | 7, 16, 20 |
| Fun | Berry Pop, Peach Soda, Lime Lab | Full or committed | 8, 10, 11 |
| Techy | Night Terminal, Blueprint Dark, Ocean Floor | Restrained, dark | 4, 17 |
| Premium | Brass Night, Gold Vault, Mono Studio | Restrained | 5, 18 |
| Warm local | Clay Market, Sand Dune, Tea House | Committed | 1, 6, 13 |
| Bold | Signal Orange, Cherry Stage, Violet Hour | Committed or drenched | 3, 12, 14, 19 |
| Cinematic | Ember Dark, Midnight Plum, Deep Forest | Restrained, dark | 2, 18 |

Dealing tip for step 3: take palettes from three different rows, so the set spans hue, lightness and strategy. If the concepts all land on light backgrounds with a green accent, redo the deal.

## Checks before a palette ships in a concept

- Each colour has one written job in the token comments.
- The accent share matches the strategy named on the card, measured on a screenshot.
- The contrast script passes on every text pair actually used, including text over images, with an overlay if needed.
- Status colours are separate from the accent and pass 4.5:1 for text.
- Greys are the palette's own tinted muted and ink values, not neutral grey.
- The palette passes the blur test: squint and the most important thing is still the brightest or darkest thing.
- The look cannot be guessed from the product category alone. If it can, rework it (`slop-check.md`, Reflex).
