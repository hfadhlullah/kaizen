// The annotator's rules that need no page: selection geometry, where the note box and tips sit, what a note holds,
// and the plan for the picture of what was picked. web/annotate/annotate.ts (the script injected into the framed page)
// reads them from here, so a test can hold them without a browser.
export type Rect = { left: number; top: number; width: number; height: number; right: number; bottom: number };

// A class name worth putting in a selector: short, and not a generated hash (css-1x2y3z, sc-, jsx-, _foo).
export const goodClass = (c: string) => c.length < 24 && !/\d{3,}|^css-|^_|^sc-|^jsx-/.test(c);

export const union = (rs: Rect[]): Rect => {
  const left = Math.min(...rs.map((r) => r.left)),
    top = Math.min(...rs.map((r) => r.top)),
    right = Math.max(...rs.map((r) => r.right)),
    bottom = Math.max(...rs.map((r) => r.bottom));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
};
// The rectangle of an area drag, from where it began to where the pointer is.
export const rectOf = (d: { x0: number; y0: number; x1: number; y1: number }): Rect => {
  const left = Math.min(d.x0, d.x1),
    top = Math.min(d.y0, d.y1),
    width = Math.abs(d.x1 - d.x0),
    height = Math.abs(d.y1 - d.y0);
  return { left, top, width, height, right: left + width, bottom: top + height };
};
// An area counts when it is at least 8 x 8; a smaller drag was a click.
export const areaBigEnough = (r: Rect) => r.width >= 8 && r.height >= 8;
// An element belongs to an area when it is not tiny and sits inside it (a pixel of slack).
export const insideArea = (b: Rect, r: Rect) =>
  b.width >= 4 &&
  b.height >= 4 &&
  b.left >= r.left - 1 &&
  b.top >= r.top - 1 &&
  b.right <= r.right + 1 &&
  b.bottom <= r.bottom + 1;
export const AREA_MAX = 20;

export const quote = (text: string, fallback: string) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t ? `"${t.slice(0, 60)}${t.length > 60 ? "…" : ""}"` : fallback;
};
export const areaLabel = (r: Rect, n: number) => `area ${Math.round(r.width)}x${Math.round(r.height)} (${n} elements)`;

// Where the note box opens: under the pick when there is room, else above it, always inside the window.
export const composerPos = (r: Rect, vw: number, vh: number) => ({
  left: Math.max(8, Math.min(vw - 316, r.left)),
  top: r.bottom + 330 < vh ? Math.min(r.bottom + 8, vh - 200) : Math.max(8, r.top - 190),
});
// A marker sits at the top right corner of what it marks; its comment under the block.
export const markerPos = (r: Rect, vw: number) => ({
  left: Math.min(vw - 12, r.left + r.width),
  top: Math.max(12, r.top),
});
export const tipPos = (r: Rect, vw: number, vh: number) => ({
  left: Math.max(8, Math.min(vw - 268, r.left)),
  top: Math.min(r.top + r.height + 8, vh - 90),
});

// What the page measured about the pick, as the board's note.
export type Pick = { kind: string; rect: Rect; count: number; selected?: string };
export type Facts = {
  selector: string;
  items: string[];
  path: string;
  text: string;
  tag: string;
  url: string;
  page: string;
  attrs: string;
  styles: string;
  nearby: string;
  source: string;
  components: string;
};
export const buildNote = (
  p: Pick,
  f: Facts,
  entry: { comment: string; intent: string; severity: string },
  scroll: { x: number; y: number },
) => ({
  kind: p.kind,
  comment: entry.comment,
  intent: entry.intent,
  severity: entry.severity,
  selector: f.selector,
  items: p.count > 1 ? f.items : [],
  path: f.path,
  text: f.text.slice(0, 200),
  tag: f.tag,
  url: f.url,
  box: `${Math.round(p.rect.left + scroll.x)},${Math.round(p.rect.top + scroll.y)} ${Math.round(p.rect.width)}x${Math.round(p.rect.height)}`,
  pb: { x: p.rect.left + scroll.x, y: p.rect.top + scroll.y, w: p.rect.width, h: p.rect.height },
  page: f.page,
  attrs: f.attrs,
  styles: f.styles,
  nearby: f.nearby,
  selected: p.selected || "",
  source: f.source,
  components: f.components,
});

// The picture of a pick: the element is cloned into an SVG and drawn on a canvas. Too big (over 2400 px) or tiny (under
// 2) means no picture; the crop is the part the user picked, in the element's own pixels.
export const CROP_MAX = 2400;
export const CROP_BUDGET = 1500; // nodes cloned at most
export const CROP_CHARS = 1_300_000; // a PNG data URL longer than this is tried again smaller
export const tooBig = (r: { width: number; height: number }) => r.width > CROP_MAX || r.height > CROP_MAX;
export const cropWindow = (br: Rect, want: Rect) => {
  if (br.width < 2 || br.height < 2 || tooBig(br)) return null;
  const w = Math.ceil(br.width),
    h = Math.ceil(br.height);
  const sx = Math.max(0, want.left - br.left),
    sy = Math.max(0, want.top - br.top);
  const sw = Math.min(w - sx, want.width),
    sh = Math.min(h - sy, want.height);
  return sw < 2 || sh < 2 ? null : { w, h, sx, sy, sw, sh };
};
// The scales to try, largest first: the device pixel ratio (at most 2) down to 0.5, never past 1600 px on the long side.
export const cropScales = (sw: number, sh: number, dpr: number) => {
  const out: number[] = [];
  for (let k = Math.min(2, dpr || 1); k >= 0.5; k -= 0.5) out.push(Math.min(k, 1600 / Math.max(sw, sh)));
  return out;
};
