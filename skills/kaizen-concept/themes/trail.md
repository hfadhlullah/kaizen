---
name: Trail
genre: editorial
paper: mid
display: condensed, Barlow Semi Condensed
body: Barlow
accent: blaze orange for the route, the booking and the one thing to carry
posture: committed
motion: calm
keywords: outdoor, travel, hiking, camping, expedition, adventure, tour, guide, trek, mountain, gear, itinerary
fonts: Barlow+Semi+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500
---

# Trail

Map-sheet paper in sand and pine, condensed headings like a trailhead sign, and a single orange that means route. It is built for a page that sells a place by showing it and giving the real numbers of the way. It is not a stock holiday page: no sunsets with quotes, no infinity-pool clichés.

```css
:root {
  --paper: #e7e3d6;
  --paper-2: #f3f0e6;
  --paper-3: #d6d1bf;
  --ink: #1d2a22;
  --ink-2: #33423a;
  --muted: #4f5b52;
  --rule: #bdb7a2;
  --accent: #b3470b;
  --accent-ink: #ffffff;
  --focus: #1d2a22;
  --font-display: 'Barlow Semi Condensed', system-ui, sans-serif;
  --font-body: 'Barlow', system-ui, sans-serif;
  --font-data: 'IBM Plex Mono', ui-monospace, monospace;
  --radius-card: 6px;
  --radius-control: 6px;
  --hairline: 1px;
  --shadow: 0 2px 0 #bdb7a2;
  --display-weight: 600;
  --display-tracking: 0;
}
```

**Type.** Headings in the condensed face at 600, sentence case, tight line height. Body 17px at 1.55. Distance, height, time and grade in mono with units written out.

**Surfaces.** Sand panels on sand paper separated by thin contour-line rules. A route is drawn as a real elevation profile or map when the user has one, never as a decorative squiggle. Photographs show the place with people at true scale.

**Controls.** Buttons are solid orange with white text and a 6px radius. Secondary buttons are outlined in pine. Date pickers show availability as text as well as colour.

**Voice.** Practical and specific: how far, how steep, what to carry, what it costs. Honest about difficulty.

**Do not.**
- orange on more than one element per section
- summit-at-sunrise stock photos as the proof
- difficulty shown only by colour
- topographic line patterns as wallpaper
