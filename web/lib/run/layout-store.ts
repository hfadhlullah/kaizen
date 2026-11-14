// The run workspace's saved layout (Zustand, kept in localStorage "kz-runtabs" as before): per workspace the extra tabs
// opened by hand (localhost, Preview, notes, History), the agent tabs closed, and the screens with their pane trees.
// The pane tree rules are in layout.ts; this store only holds them, so the panes (components/run/run-panes.tsx) are
// drawn from it and a resize, a split or a drag is a state change, never a DOM move.
import { create } from "zustand";
import {
  leaves,
  moveItem as moveIn,
  prune,
  reconcile,
  resize,
  type Dir,
  type Node,
  type Screen,
  type Target,
} from "./layout.ts";

export type SavedTab = { id: string; kind: string; title: string; key?: string; note?: string; agent?: string };
// `seen`: the runs that already opened the Browser on their Preview, so a run does it once.
export type Saved = {
  tabs: SavedTab[];
  hidden: string[];
  hb?: Record<string, number>;
  screens: Screen[];
  on: string | null;
  seen?: string[];
};
const KEY = "kz-runtabs";
export const EMPTY: Saved = { tabs: [], hidden: [], screens: [], on: null };

// Layouts saved while runs were tabs: those tabs are gone, the panel picks runs now. Older saves had one split.
export function clean(s: Partial<Saved>): Saved {
  const screens = Array.isArray(s.screens) && s.screens.every((sc) => sc?.tree) ? s.screens : [];
  return {
    ...s,
    tabs: (s.tabs ?? []).filter((t) => t.kind !== "run"),
    hidden: (s.hidden ?? []).filter((h) => !h.startsWith("rn:")),
    screens,
    on: s.on ?? null,
  };
}
const read = (): Record<string, Saved> => {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, Partial<Saved>>;
    return Object.fromEntries(Object.entries(all).map(([k, s]) => [k, clean(s)]));
  } catch {
    return {};
  }
};
const persist = (all: Record<string, Saved>) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {}
};
const newId = () => "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

export type Layout = {
  all: Record<string, Saved>;
  dragging: string | null; // the item whose header or tab is being dragged
  target: Target; // where the next item goes (set by the split menus)
  // A request to open an address in a workspace's Browser tab; the tab takes it when it shows.
  browse: { k: string; url: string } | null;
  previewTick: number; // bumped to make the Preview tab read its run again
};
export const useLayout = create<Layout>()(() => ({
  all: read(),
  dragging: null,
  target: null,
  browse: null,
  previewTick: 0,
}));
const set = useLayout.setState;
export const layoutOf = (k: string): Saved => useLayout.getState().all[k] ?? EMPTY;
// Changes one workspace's record; `save: false` for the middle of a drag (the end saves).
export function patch(k: string, fn: (s: Saved) => Saved, save = true) {
  const { all } = useLayout.getState(),
    cur = all[k] ?? EMPTY,
    next = fn(cur);
  if (next === cur) return;
  const a = { ...all, [k]: next };
  set({ all: a });
  if (save) persist(a);
}
export const saveLayout = () => persist(useLayout.getState().all);
// Replaces every record (the old per-run layouts moved to their workspace).
export function replaceAll(all: Record<string, Saved>) {
  const a = Object.fromEntries(Object.entries(all).map(([k, s]) => [k, clean(s)]));
  set({ all: a });
  persist(a);
}

export const setTarget = (target: Target) => set({ target });
export const setDragging = (dragging: string | null) => set({ dragging });
export const requestBrowse = (k: string, url: string) => set({ browse: { k, url } });
export const clearBrowse = () => set({ browse: null });
export const refreshPreview = () => set((s) => ({ previewTick: s.previewTick + 1 }));

// After the open items changed: each sits in one screen (see layout.ts reconcile). Saves only when something moved.
export function placeItems(k: string, ids: string[]) {
  const { target } = useLayout.getState(),
    s = layoutOf(k),
    r = reconcile(s.screens, s.on, ids, target, newId);
  if (r.target !== target) set({ target: r.target });
  patch(k, (c) => (r.screens === c.screens && r.on === c.on ? c : { ...c, screens: r.screens, on: r.on }));
}
export const selectScreen = (k: string, sid: string) => patch(k, (s) => (s.on === sid ? s : { ...s, on: sid }));
export const focusItem = (k: string, id: string) =>
  patch(k, (s) => {
    const sc = s.screens.find((x) => x.id === s.on);
    return !sc || sc.focus === id ? s : { ...s, screens: s.screens.map((x) => (x === sc ? { ...sc, focus: id } : x)) };
  });
// Shows the screen that holds the item, if one does.
export const showItem = (k: string, id: string) =>
  patch(k, (s) => {
    const on = s.screens.find((sc) => leaves(sc.tree).includes(id))?.id ?? s.on;
    return on === s.on ? s : { ...s, on };
  });
export function moveInLayout(
  k: string,
  id: string,
  to: string | null,
  at?: { pane: string; dir: Dir; before: boolean },
) {
  const r = moveIn(layoutOf(k).screens, id, to, at, newId);
  if (r) patch(k, (s) => ({ ...s, screens: r.screens, on: r.on }));
  return !!r;
}
// Moving an open item into the target screen means taking it out of its old one.
export const detach = (k: string, id: string) =>
  patch(k, (s) => ({
    ...s,
    screens: s.screens.map((sc) => ({ ...sc, tree: prune(sc.tree, (x) => x !== id) ?? sc.tree })),
  }));
// A gutter drag: the sizes follow the pointer without saving; the end saves.
export const resizeAt = (k: string, sid: string, path: number[], i: number, f: number) =>
  patch(
    k,
    (s) => ({
      ...s,
      screens: s.screens.map((sc) => (sc.id === sid ? { ...sc, tree: resize(sc.tree, path, i, f) as Node } : sc)),
    }),
    false,
  );
