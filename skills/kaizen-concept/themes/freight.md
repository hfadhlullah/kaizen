---
name: Freight
genre: modern-minimal
paper: mid
display: condensed, Big Shoulders Display
body: Chivo
accent: safety yellow for the status that needs a person and the one dispatch action
posture: committed
motion: severe
keywords: logistics, freight, shipping, warehouse, fleet, industrial, supply chain, depot, dispatch, manufacturing, trucks, tracking
fonts: Big+Shoulders+Display:wght@700;800&family=Chivo:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500
---

# Freight

Concrete grey, steel panels and a safety-yellow signal, set in condensed type that reads at a distance. It suits a page or screen used by someone on a loading bay or a dispatcher with fifty rows. It is not a hazard-tape costume: no diagonal stripes, no rivets.

```css
:root {
  --paper: #e3e6e8;
  --paper-2: #f1f3f4;
  --paper-3: #cfd4d8;
  --ink: #14181c;
  --ink-2: #2c333a;
  --muted: #4b545d;
  --rule: #9ea7b0;
  --accent: #f2b600;
  --accent-ink: #14181c;
  --focus: #14181c;
  --font-display: 'Big Shoulders Display', Impact, sans-serif;
  --font-body: 'Chivo', system-ui, sans-serif;
  --font-data: 'IBM Plex Mono', ui-monospace, monospace;
  --radius-card: 2px;
  --radius-control: 2px;
  --hairline: 2px;
  --shadow: none;
  --display-weight: 800;
  --display-tracking: 0.01em;
}
```

**Type.** Headings in the condensed face at 800, set in sentence case at large sizes. Body 16px at 1.5. Waybills, plates, weights and times in mono, tabular, with units. Status words are written, never only coloured.

**Surfaces.** Flat steel panels with 2px dark rules. Dense tables with 40px rows and clear column heads. A status chip pairs a word with a shape. Photographs show real depots and vehicles, never a generic container ship.

**Controls.** Square-edged buttons at least 48px tall for gloves. Primary is yellow with dark text. Destructive actions ask for confirmation with the shipment id repeated.

**Voice.** Direct and operational: ids, quantities, times, and what is late. No slogans about moving the world.

**Do not.**
- yellow and black hazard stripes
- status shown only by colour
- small touch targets on mobile views
- stock photos of globes and cargo ships
