// The run workspace's pane layout as plain data, no DOM. A screen is one tab of the workspace's bar and holds a
// tmux-style tree: a leaf is an item id, a split holds two or more children side by side ("cols") or stacked ("rows")
// with their relative sizes. Every function returns a new value (or the same one when nothing changed), so the layout
// store can compare by identity and React can draw each pane from its rectangle without moving any pane element.
export type Dir = "cols" | "rows";
export type Node = string | { dir: Dir; kids: Node[]; sizes: number[] };
export type Screen = { id: string; tree: Node; focus: string };
// Where the next new item goes: beside or below the focused pane of a screen; null: a screen of its own.
export type Target = { screen: string; dir: Dir } | null;
export type Box = { left: number; top: number; right: number; bottom: number };
// A pane's place in its container as fractions (0..1).
export type Rect = { l: number; t: number; w: number; h: number };
// The bar between two children: where it sits, and the span of the two children it divides (`start`, `total` along
// its axis, as container fractions) so a pointer position maps to their share.
export type Gut = {
  path: number[];
  i: number;
  dir: Dir;
  x: number;
  y: number;
  len: number;
  start: number;
  total: number;
};

export const leaves = (n: Node): string[] => (typeof n === "string" ? [n] : n.kids.flatMap(leaves));
// Drops ids no longer open; a split left with one child becomes that child.
export function prune(n: Node, keep: (id: string) => boolean): Node | null {
  if (typeof n === "string") return keep(n) ? n : null;
  const kids: Node[] = [],
    sizes: number[] = [];
  n.kids.forEach((k, i) => {
    const p = prune(k, keep);
    if (p) (kids.push(p), sizes.push(n.sizes[i] ?? 1));
  });
  if (!kids.length) return null;
  if (kids.length === 1) return kids[0]!;
  // Nothing dropped: the same node.
  return kids.length === n.kids.length && kids.every((k, i) => k === n.kids[i]) ? n : { dir: n.dir, kids, sizes };
}
// tmux: the pane `at` splits in two, the new item right of or under it (`before`: left of or above).
export function splitAt(n: Node, at: string, add: string, dir: Dir, before = false): Node {
  if (typeof n === "string") return n === at ? { dir, kids: before ? [add, n] : [n, add], sizes: [1, 1] } : n;
  return { ...n, kids: n.kids.map((k) => splitAt(k, at, add, dir, before)) };
}

// The pane next to `from` in a direction: it must lie past that edge and share some of the
// other axis; the closest wins, then the one lined up best.
export function nearestPane(boxes: Record<string, Box>, from: string, dir: "l" | "r" | "u" | "d"): string | null {
  const a = boxes[from];
  if (!a) return null;
  const across = dir === "l" || dir === "r";
  const gap = (b: Box) =>
    dir === "l" ? a.left - b.right : dir === "r" ? b.left - a.right : dir === "u" ? a.top - b.bottom : b.top - a.bottom;
  const lap = (b: Box) =>
    across
      ? Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      : Math.min(a.right, b.right) - Math.max(a.left, b.left);
  let best: string | null = null;
  for (const [id, b] of Object.entries(boxes)) {
    if (id === from || gap(b) < -1 || lap(b) <= 0) continue;
    const cur = best && boxes[best];
    if (!cur || gap(b) < gap(cur) - 1 || (Math.abs(gap(b) - gap(cur)) <= 1 && lap(b) > lap(cur))) best = id;
  }
  return best;
}
// The panes' rectangles as boxes in thousandths of the container, for nearestPane (which forgives a gap of one unit).
export const boxesOf = (r: Record<string, Rect>): Record<string, Box> =>
  Object.fromEntries(
    Object.entries(r).map(([id, b]) => [
      id,
      { left: b.l * 1000, top: b.t * 1000, right: (b.l + b.w) * 1000, bottom: (b.t + b.h) * 1000 },
    ]),
  );

const whole: Rect = { l: 0, t: 0, w: 1, h: 1 };
// Every pane's rectangle and every gutter of a tree laid out in the whole container.
export function rects(tree: Node, box: Rect = whole): { panes: Record<string, Rect>; guts: Gut[] } {
  const panes: Record<string, Rect> = {},
    guts: Gut[] = [];
  const walk = (n: Node, b: Rect, path: number[]) => {
    if (typeof n === "string") return void (panes[n] = b);
    const cols = n.dir === "cols",
      sum = n.sizes.reduce((s, x) => s + x, 0) || 1,
      span = cols ? b.w : b.h;
    let at = cols ? b.l : b.t,
      prev = at;
    n.kids.forEach((k, i) => {
      const share = ((n.sizes[i] ?? 1) / sum) * span;
      if (i) {
        const total = at + share - prev;
        guts.push(
          cols
            ? { path, i, dir: n.dir, x: at, y: b.t, len: b.h, start: prev, total }
            : { path, i, dir: n.dir, x: b.l, y: at, len: b.w, start: prev, total },
        );
      }
      walk(k, cols ? { ...b, l: at, w: share } : { ...b, t: at, h: share }, [...path, i]);
      prev = at;
      at += share;
    });
  };
  walk(tree, box, []);
  return { panes, guts };
}
// The share of a gutter's two children that the first one gets when the pointer is at `pos` (a container fraction).
export const gutFrac = (g: Gut, pos: number) => Math.min(0.9, Math.max(0.1, (pos - g.start) / g.total));
// A tree with the two children around gutter `i` of the split at `path` sharing their space as `f` : 1 - f.
export function resize(tree: Node, path: number[], i: number, f: number): Node {
  if (typeof tree === "string") return tree;
  if (path.length) {
    const [head, ...rest] = path as [number, ...number[]];
    return { ...tree, kids: tree.kids.map((k, j) => (j === head ? resize(k, rest, i, f) : k)) };
  }
  const sum = tree.sizes[i - 1]! + tree.sizes[i]!,
    sizes = tree.sizes.slice();
  sizes[i - 1] = sum * f;
  sizes[i] = sum * (1 - f);
  return { ...tree, sizes };
}

// The edge of a pane a pointer is nearest to (x and y are its place in the pane as fractions): where a dropped item splits it.
export function edgeOf(x: number, y: number): "l" | "r" | "t" | "b" {
  const d: ["l" | "r" | "t" | "b", number][] = [
    ["l", x],
    ["r", 1 - x],
    ["t", y],
    ["b", 1 - y],
  ];
  return d.sort((a, b) => a[1] - b[1])[0]![0];
}

const sameList = <T>(a: T[], b: T[]) => a.length === b.length && a.every((x, i) => x === b[i]);
// Every item sits in exactly one screen. Items no longer open leave their screen (an emptied screen goes); an item
// not placed yet goes to `target`, else to a screen of its own. `on` falls back to the first screen. Returns the
// same arrays when nothing changed. `target` comes back null once it was used.
export function reconcile(
  screens: Screen[],
  on: string | null,
  ids: string[],
  target: Target,
  newId: () => string,
): { screens: Screen[]; on: string | null; target: Target } {
  let list = screens.flatMap((sc) => {
    const tree = prune(sc.tree, (id) => ids.includes(id));
    if (!tree) return [];
    const focus = leaves(tree).includes(sc.focus) ? sc.focus : leaves(tree)[0]!;
    return [tree === sc.tree && focus === sc.focus ? sc : { ...sc, tree, focus }];
  });
  for (const id of ids)
    if (!list.some((sc) => leaves(sc.tree).includes(id))) {
      const into = target && list.find((sc) => sc.id === target!.screen);
      if (into) {
        const t = target!;
        list = list.map((sc) => (sc === into ? { ...sc, tree: splitAt(sc.tree, sc.focus, id, t.dir), focus: id } : sc));
        on = into.id;
      } else list = [...list, { id: newId(), tree: id, focus: id }];
      target = null;
    }
  if (!list.some((sc) => sc.id === on)) on = list[0]?.id ?? null;
  return { screens: sameList(list, screens) ? screens : list, on, target };
}

// Moves an item out of its screen into another one (split beside pane `at.pane` there, or next to that screen's
// focused pane), or into a screen of its own (to = null). Null when there is nothing to do.
export function moveItem(
  screens: Screen[],
  id: string,
  to: string | null,
  at: { pane: string; dir: Dir; before: boolean } | undefined,
  newId: () => string,
): { screens: Screen[]; on: string } | null {
  if (at?.pane === id) return null;
  // Dropped on the screen it is already in, with no pane edge to split at: nothing to do.
  if (!at && to && screens.some((sc) => sc.id === to && leaves(sc.tree).includes(id))) return null;
  let list = screens
    .map((sc) => {
      const tree = prune(sc.tree, (x) => x !== id) ?? "";
      return { ...sc, tree, focus: tree !== "" && !leaves(tree).includes(sc.focus) ? leaves(tree)[0]! : sc.focus };
    })
    .filter((sc) => sc.tree !== "");
  const dest = to ? list.find((sc) => sc.id === to) : undefined;
  if (dest) {
    list = list.map((sc) =>
      sc === dest
        ? { ...sc, tree: splitAt(sc.tree, at?.pane ?? sc.focus, id, at?.dir ?? "cols", at?.before ?? false), focus: id }
        : sc,
    );
    return { screens: list, on: dest.id };
  }
  const sid = newId();
  return { screens: [...list, { id: sid, tree: id, focus: id }], on: sid };
}
