// The annotator's note model, board side: what the page sends, what the board keeps (and saves without the crops),
// the settings, and the two request bodies (Copy -> /annotate/format, Send -> /annotate/send). No DOM, no requests.
import { MAX_BOARD_NOTES, mapUrl, safeCrop } from "./rules.ts";

export type Note = Record<string, any> & { id: string; n: number };
export type Settings = {
  mode: string;
  level: string;
  components: boolean;
  color: string;
  clear: boolean;
  block: boolean;
};
export const DEFAULTS: Settings = {
  mode: "element",
  level: "standard",
  components: true,
  color: "#3c82f7",
  clear: false,
  block: true,
};
export const LEVELS = ["compact", "standard", "detailed", "forensic"];

// What the page needs to draw a marker for each note (the board keeps the rest).
export const markersOf = (notes: Note[]) =>
  notes.map((n) => ({
    n: n.n,
    kind: n.kind,
    selector: n.selector,
    items: n.items,
    pb: n.pb,
    page: n.page,
    comment: n.comment,
    intent: n.intent,
    severity: n.severity,
  }));
// Saved and sent to /annotate/format without the crops (a crop is up to ~1 MB of PNG).
export const withoutCrops = (notes: Note[]) => notes.map(({ crop, ...n }) => n);
export const group = (kind: unknown) => kind === "multi" || kind === "area";

// A note from the page becomes a board note: a fresh id and number, the crop only if it is a small PNG, and its address
// only if it is on the proxy (shown as the app's own). Null once the board holds as many as it will.
export function fromPage(
  raw: Record<string, any>,
  count: number,
  n: number,
  px: { origin: string; target: string },
): Note | null {
  if (count >= MAX_BOARD_NOTES) return null;
  return {
    ...raw,
    id: Math.random().toString(36).slice(2),
    n,
    crop: safeCrop(raw.crop),
    url: mapUrl(String(raw.url || ""), px.origin, px.target) ?? "",
    page: String(raw.page || ""),
  };
}
export const without = (notes: Note[], n: number) => notes.filter((x) => x.n !== n);
// The edited comment, or the same list when it is empty or unchanged.
export const editedComment = (notes: Note[], n: number, text: string): Note[] => {
  const t = text.trim();
  return t && notes.some((x) => x.n === n && x.comment !== t)
    ? notes.map((x) => (x.n === n ? { ...x, comment: t } : x))
    : notes;
};

export const formatBody = (notes: Note[], s: Pick<Settings, "level" | "components">) => ({
  notes: withoutCrops(notes),
  level: s.level,
  components: s.components,
});
export const sendBody = (
  run: { dir: string; id: string },
  notes: Note[],
  s: Pick<Settings, "level" | "components">,
) => ({ dir: run.dir, id: run.id, notes: notes.map((n) => ({ ...n })), level: s.level, components: s.components });
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

// Notes and settings live in localStorage (the notes per workspace, as before: same keys).
const read = <T>(k: string, d: T): T => {
  try {
    return { ...d, ...JSON.parse(localStorage.getItem(k) || "{}") };
  } catch {
    return d;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* private window */
  }
};
export const loadSettings = (): Settings => read("kz-annotate", DEFAULTS);
export const saveSettings = (s: Settings) => write("kz-annotate", s);
export const loadNotes = (ws: string): Note[] => {
  try {
    const l = JSON.parse(localStorage.getItem("kz-ann:" + ws) || "[]");
    return Array.isArray(l) ? l : [];
  } catch {
    return [];
  }
};
export const saveNotes = (ws: string, notes: Note[]) => write("kz-ann:" + ws, withoutCrops(notes));
