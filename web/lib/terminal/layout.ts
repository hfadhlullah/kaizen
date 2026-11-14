// The Terminal page's rules, with no DOM: every in-card agent session the board knows, tiled. Which tiles show and in
// what order, the grid's shape, the track sizes and where a border handle sits, and how a drag changes the sizes.
// ponytail: a √n grid with draggable borders, not an i3-style split tree; add one if a grid falls short.

// grid (√n), cols (side by side) or rows (stacked, so borders drag up and down).
export type Mode = "grid" | "cols" | "rows";
export const MODES: [Mode, string, string][] = [
  ["grid", "Grid", "lgrid"],
  ["cols", "Side by side", "lcols"],
  ["rows", "Stacked", "lrows"],
];
export type Sizes = { c: number[]; r: number[] };
// Layout is per browser (kz-terms): tile order, hidden tiles, the maximised one, and the split sizes per grid shape.
export type Lay = { mode: Mode; order: string[]; hidden: string[]; max: string | null; sizes: Record<string, Sizes> };
export const LAY_KEY = "kz-terms";
export const GAP = 1;
// One session: a card with an agent in the board (run or task) or a shell, as terminalSessions() makes it.
export type Session = {
  kind: string;
  id?: string;
  text?: string;
  where?: string;
  state?: string;
  pty: { key: string; alive: boolean; asking: boolean };
};

export const EMPTY: Lay = { mode: "grid", order: [], hidden: [], max: null, sizes: {} };
export function readLay(raw: string | null): Lay {
  try {
    const l = { ...EMPTY, ...JSON.parse(raw || "{}") } as Lay;
    return MODES.some((m) => m[0] === l.mode) ? l : { ...l, mode: "grid" };
  } catch {
    return EMPTY;
  }
}
// Only the last 100 keys are kept.
export const trimLay = (l: Lay): Lay => ({ ...l, order: l.order.slice(-100), hidden: l.hidden.slice(-100) });

// The header: run name - project name. A run's name is its id without the date, as card chips name runs.
export const nameOf = (c: Session) =>
  c.kind === "run"
    ? String(c.id || c.text)
        .replace(/^\d{4}-\d\d-\d\d-/, "")
        .replace(/-/g, " ")
    : String(c.text).split("\n")[0]!.slice(0, 80);
export const stateOf = (c: Session) => (!c.pty.alive ? "ended" : c.pty.asking ? "asking" : "running");
export const projOf = (c: Session) =>
  String(c.where || "")
    .split(/[\\/]/)
    .filter(Boolean)
    .pop() ||
  c.where ||
  "";
export const labelOf = (c: Session) => `${nameOf(c)} - ${projOf(c)}`;

export type Arranged = {
  keys: string[]; // the tiles that show: live first, ended after, each in the saved order
  hid: string[]; // the hidden live ones (the bar's chips); an ended one closed with × has nothing to come back to
  order: string[]; // the saved order, with the keys not seen before at its end
  max: string | null; // the maximised tile, if it still shows
  one: string | null; // the one tile showing: on a phone the tab picked (the first by default), else the maximised one
};
export function arrange(all: Map<string, Session>, lay: Lay, phone: boolean, pick: string | null): Arranged {
  const rank = (k: string) => (lay.order.includes(k) ? lay.order.indexOf(k) : 1e9);
  const ended = (k: string) => (all.get(k)!.pty.alive ? 0 : 1);
  const keys = [...all.keys()]
    .filter((k) => !lay.hidden.includes(k))
    .sort((a, b) => ended(a) - ended(b) || rank(a) - rank(b));
  const order = [...lay.order, ...keys.filter((k) => !lay.order.includes(k))];
  const max = lay.max && keys.includes(lay.max) ? lay.max : null;
  return {
    keys,
    hid: [...all.keys()].filter((k) => lay.hidden.includes(k) && all.get(k)!.pty.alive),
    order,
    max,
    one: phone ? (pick && keys.includes(pick) ? pick : (keys[0] ?? null)) : max,
  };
}
// The side menu's Terminal entry counts the live tiles hidden here.
export const hiddenCount = (all: Map<string, Session>, lay: Lay) =>
  lay.hidden.filter((k) => all.get(k)?.pty.alive).length;
// Two tiles swap places (a header dropped on another tile); null when either is not in the order.
export function swapOrder(order: string[], from: string, to: string): string[] | null {
  const i = order.indexOf(from),
    j = order.indexOf(to);
  if (i < 0 || j < 0 || i === j) return null;
  const out = [...order];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

export type Shape = { cols: number; rows: number; spanFrom: number; key: string; span: number };
// Grid is √n, the last tile spanning what its row leaves empty; side by side is one row, stacked one column.
// `span`: how many columns the last tile covers; `spanFrom`: the column where it starts, right of which the borders are
// not inner ones in that row.
export function shapeOf(n: number, mode: Mode, one: boolean): Shape {
  const count = one ? 1 : Math.max(1, n),
    cols = mode === "cols" ? count : mode === "rows" ? 1 : Math.ceil(Math.sqrt(count)),
    rows = Math.ceil(count / cols);
  const span = !one && cols * rows > count ? cols * rows - count + 1 : 1;
  return {
    cols,
    rows,
    spanFrom: span > 1 ? count - (rows - 1) * cols - 1 : cols,
    key: `${mode}:${cols}x${rows}`,
    span,
  };
}
// Saved sizes only count when they fit the shape's track count.
export function sizesOf(saved: Sizes | undefined, s: Shape): Sizes {
  return {
    c: saved?.c?.length === s.cols ? saved.c : Array(s.cols).fill(1),
    r: saved?.r?.length === s.rows ? saved.r : Array(s.rows).fill(1),
  };
}

// Track sizes are in fr, and a handle sits on each inner border: its centre is the tracks before it sharing
// (100% - gaps) by their fr, plus the gaps before it.
export const handleAt = (tr: number[], i: number) => {
  const F = tr.reduce((a, b) => a + b, 0),
    S = tr.slice(0, i + 1).reduce((a, b) => a + b, 0);
  return `calc((100% - ${(tr.length - 1) * GAP}px) * ${S / F} + ${i * GAP + GAP / 2}px)`;
};
// A column handle stops above the last row where that row's spanning tile covers the border.
export const handleBottom = (r: number[], i: number, spanFrom: number) =>
  i >= spanFrom ? `calc(100% - ${handleAt(r, r.length - 2)} + ${GAP / 2}px)` : "0px";
// The tracks after dragging the border between track i and i+1 by `delta` px over `span` px: neither gets under a tenth.
export function dragTracks(tr: number[], i: number, delta: number, span: number): number[] {
  const F = tr.reduce((a, b) => a + b, 0),
    min = F * 0.1,
    a = tr[i]!,
    b = tr[i + 1]!;
  const d = Math.max(min - a, Math.min(b - min, (delta / span) * F));
  const out = [...tr];
  out[i] = a + d;
  out[i + 1] = b - d;
  return out;
}
