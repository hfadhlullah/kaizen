import { expect, test } from "bun:test";
import {
  boxesOf,
  edgeOf,
  gutFrac,
  leaves,
  moveItem,
  nearestPane,
  prune,
  reconcile,
  rects,
  resize,
  splitAt,
  type Node,
  type Screen,
} from "./layout.ts";

const ids = () => {
  let n = 0;
  return () => "s" + ++n;
};
const sc = (id: string, tree: Node, focus = leaves(tree)[0]!): Screen => ({ id, tree, focus });

test("splitAt puts the new item right of or under the pane, or before it", () => {
  expect(splitAt("a", "a", "b", "cols")).toEqual({ dir: "cols", kids: ["a", "b"], sizes: [1, 1] });
  expect(splitAt("a", "a", "b", "rows", true)).toEqual({ dir: "rows", kids: ["b", "a"], sizes: [1, 1] });
  const t = splitAt(splitAt("a", "a", "b", "cols"), "b", "c", "rows");
  expect(leaves(t)).toEqual(["a", "b", "c"]);
  expect(splitAt("a", "zzz", "b", "cols")).toBe("a");
});

test("prune keeps the same node when nothing is dropped and collapses a split left with one child", () => {
  const t = splitAt("a", "a", "b", "cols");
  expect(prune(t, () => true)).toBe(t);
  expect(prune(t, (id) => id === "a")).toBe("a");
  expect(prune(t, () => false)).toBeNull();
});

test("reconcile places a new item in its own screen, or beside the target's focused pane, and drops closed ones", () => {
  const n = ids();
  const first = reconcile([], null, ["a"], null, n);
  expect(first.screens).toEqual([sc("s1", "a")]);
  expect(first.on).toBe("s1");
  const beside = reconcile(first.screens, first.on, ["a", "b"], { screen: "s1", dir: "cols" }, n);
  expect(beside.screens[0]!.tree).toEqual({ dir: "cols", kids: ["a", "b"], sizes: [1, 1] });
  expect(beside.screens[0]!.focus).toBe("b");
  expect(beside.target).toBeNull();
  const alone = reconcile(beside.screens, "s1", ["a", "b", "c"], null, n);
  expect(alone.screens.map((s) => s.id)).toEqual(["s1", "s2"]);
  const closed = reconcile(alone.screens, "s2", ["a"], null, n);
  expect(closed.screens).toHaveLength(1);
  expect(closed.on).toBe("s1");
  expect(closed.screens[0]!.tree).toBe("a");
});

test("reconcile returns the same arrays when nothing changed", () => {
  const screens = [sc("s1", splitAt("a", "a", "b", "cols"))];
  const r = reconcile(screens, "s1", ["a", "b"], null, ids());
  expect(r.screens).toBe(screens);
  expect(r.on).toBe("s1");
});

test("moveItem splits at a pane edge, moves to a screen, makes a screen, and ignores no-ops", () => {
  const n = ids();
  const screens = [sc("s1", splitAt("a", "a", "b", "cols")), sc("s2", "c")];
  expect(moveItem(screens, "a", "s1", { pane: "a", dir: "rows", before: false }, n)).toBeNull();
  expect(moveItem(screens, "a", "s1", undefined, n)).toBeNull();
  const into = moveItem(screens, "a", "s2", { pane: "c", dir: "cols", before: true }, n)!;
  expect(into.on).toBe("s2");
  expect(into.screens.find((s) => s.id === "s2")!.tree).toEqual({ dir: "cols", kids: ["a", "c"], sizes: [1, 1] });
  expect(into.screens.find((s) => s.id === "s1")!.tree).toBe("b");
  const own = moveItem(screens, "c", null, undefined, () => "s3")!;
  expect(own.screens.map((s) => s.id)).toEqual(["s1", "s3"]);
  expect(own.on).toBe("s3");
  // An emptied screen goes.
  expect(moveItem([sc("s1", "a"), sc("s2", "b")], "a", "s2", undefined, n)!.screens.map((s) => s.id)).toEqual(["s2"]);
});

test("rects lays panes and gutters out by their sizes", () => {
  const t: Node = { dir: "cols", kids: ["a", { dir: "rows", kids: ["b", "c"], sizes: [1, 1] }], sizes: [1, 3] };
  const { panes, guts } = rects(t);
  expect(panes.a).toEqual({ l: 0, t: 0, w: 0.25, h: 1 });
  expect(panes.b).toEqual({ l: 0.25, t: 0, w: 0.75, h: 0.5 });
  expect(panes.c).toEqual({ l: 0.25, t: 0.5, w: 0.75, h: 0.5 });
  expect(guts).toHaveLength(2);
  expect(guts[0]).toMatchObject({ path: [], i: 1, dir: "cols", x: 0.25, y: 0, len: 1, start: 0, total: 1 });
  expect(guts[1]).toMatchObject({ path: [1], i: 1, dir: "rows", x: 0.25, y: 0.5, len: 0.75, start: 0, total: 1 });
});

test("a gutter drag maps the pointer to the pair's share, clamped, and rewrites only that split", () => {
  const t: Node = { dir: "cols", kids: ["a", { dir: "rows", kids: ["b", "c"], sizes: [1, 1] }], sizes: [1, 1] };
  const g = rects(t).guts.find((x) => x.dir === "rows")!;
  expect(gutFrac(g, 0.5)).toBeCloseTo(0.5); // a rows gutter reads the pointer's y
  expect(gutFrac(g, -5)).toBe(0.1);
  expect(gutFrac(g, 9)).toBe(0.9);
  const next = resize(t, g.path, g.i, 0.25) as Exclude<Node, string>;
  expect(next.sizes).toEqual([1, 1]);
  expect((next.kids[1] as Exclude<Node, string>).sizes).toEqual([0.5, 1.5]);
  expect(next.kids[0]).toBe("a");
  expect((t as Exclude<Node, string>).sizes).toEqual([1, 1]);
});

test("nearestPane works on the laid-out boxes", () => {
  const t = splitAt(splitAt("a", "a", "b", "cols"), "b", "c", "rows");
  const boxes = boxesOf(rects(t).panes);
  expect(nearestPane(boxes, "a", "r")).toBe("b");
  expect(nearestPane(boxes, "c", "u")).toBe("b");
  expect(nearestPane(boxes, "c", "l")).toBe("a");
  expect(nearestPane(boxes, "a", "l")).toBeNull();
});

test("edgeOf names the nearest edge, the left one on a tie", () => {
  expect(edgeOf(0.1, 0.5)).toBe("l");
  expect(edgeOf(0.9, 0.5)).toBe("r");
  expect(edgeOf(0.5, 0.05)).toBe("t");
  expect(edgeOf(0.5, 0.95)).toBe("b");
  expect(edgeOf(0.5, 0.5)).toBe("l");
});
