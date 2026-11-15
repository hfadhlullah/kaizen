import { expect, test } from "bun:test";
import {
  arrange,
  dragTracks,
  handleAt,
  handleBottom,
  hiddenCount,
  labelOf,
  nameOf,
  readLay,
  shapeOf,
  sizesOf,
  stateOf,
  swapOrder,
  trimLay,
  type Lay,
  type Session,
} from "./layout.ts";

const s = (key: string, o: Partial<Session> = {}, alive = true, asking = false): Session => ({
  kind: "run",
  id: "2026-11-14-fix-the-thing",
  where: "/home/me/proj",
  pty: { key, alive, asking },
  ...o,
});
const lay = (o: Partial<Lay> = {}): Lay => ({ mode: "grid", order: [], hidden: [], max: null, sizes: {}, ...o });
const all = (...x: Session[]) => new Map(x.map((v) => [v.pty.key, v]));

test("a run is named by its id without the date, a task or shell by its first line; the project is the folder", () => {
  expect(nameOf(s("a"))).toBe("fix the thing");
  expect(nameOf(s("a", { kind: "idea", text: "First line\nsecond" }))).toBe("First line");
  expect(labelOf(s("a", { where: "C:\\work\\app" }))).toBe("fix the thing - app");
  expect(stateOf(s("a", {}, false))).toBe("ended");
  expect(stateOf(s("a", {}, true, true))).toBe("asking");
  expect(stateOf(s("a"))).toBe("running");
});

test("readLay survives junk and an unknown mode", () => {
  expect(readLay("not json").mode).toBe("grid");
  expect(readLay('{"mode":"rows","hidden":["x"]}')).toMatchObject({ mode: "rows", hidden: ["x"], max: null });
  expect(readLay('{"mode":"spiral"}').mode).toBe("grid");
  expect(trimLay(lay({ order: Array.from({ length: 150 }, (_, i) => "k" + i) })).order.length).toBe(100);
});

test("live tiles come first, ended ones after, each in the saved order; new keys join the order", () => {
  const a = arrange(all(s("a"), s("b", {}, false), s("c"), s("d")), lay({ order: ["c", "a", "b"] }), false, null);
  expect(a.keys).toEqual(["c", "a", "d", "b"]);
  expect(a.order).toEqual(["c", "a", "b", "d"]);
});

test("hidden live tiles are chips; an ended hidden one is gone; max must still show", () => {
  const x = all(s("a"), s("b"), s("c", {}, false));
  const a = arrange(x, lay({ hidden: ["b", "c"], max: "b" }), false, null);
  expect(a.keys).toEqual(["a"]);
  expect(a.hid).toEqual(["b"]);
  expect(a.max).toBeNull();
  expect(hiddenCount(x, lay({ hidden: ["b", "c", "zzz"] }))).toBe(1);
});

test("one tile shows: the maximised one, or on a phone the picked tab (else the first)", () => {
  const x = all(s("a"), s("b"));
  expect(arrange(x, lay({ max: "b" }), false, "a").one).toBe("b");
  expect(arrange(x, lay(), false, null).one).toBeNull();
  expect(arrange(x, lay({ max: "b" }), true, "a").one).toBe("a");
  expect(arrange(x, lay(), true, "gone").one).toBe("a");
});

test("swapOrder swaps two known keys", () => {
  expect(swapOrder(["a", "b", "c"], "a", "c")).toEqual(["c", "b", "a"]);
  expect(swapOrder(["a", "b"], "a", "x")).toBeNull();
  expect(swapOrder(["a", "b"], "a", "a")).toBeNull();
});

test("grid is √n with the last tile spanning the rest of its row; cols and rows are one line", () => {
  expect(shapeOf(5, "grid", false)).toMatchObject({ cols: 3, rows: 2, span: 2, spanFrom: 1, key: "grid:3x2" });
  expect(shapeOf(4, "grid", false)).toMatchObject({ cols: 2, rows: 2, span: 1, spanFrom: 2 });
  expect(shapeOf(3, "cols", false)).toMatchObject({ cols: 3, rows: 1, key: "cols:3x1" });
  expect(shapeOf(3, "rows", false)).toMatchObject({ cols: 1, rows: 3 });
  expect(shapeOf(0, "grid", false)).toMatchObject({ cols: 1, rows: 1 }); // no tiles: never an invalid track count
  expect(shapeOf(7, "grid", true)).toMatchObject({ cols: 1, rows: 1, span: 1 });
});

test("saved sizes count only when they fit the shape", () => {
  const sh = shapeOf(4, "grid", false);
  expect(sizesOf({ c: [2, 1], r: [1, 1] }, sh)).toEqual({ c: [2, 1], r: [1, 1] });
  expect(sizesOf({ c: [2, 1, 1], r: [1] }, sh)).toEqual({ c: [1, 1], r: [1, 1] });
  expect(sizesOf(undefined, sh)).toEqual({ c: [1, 1], r: [1, 1] });
});

test("a handle sits at the share of the tracks before it; a spanning row stops the column handle", () => {
  expect(handleAt([1, 1], 0)).toBe("calc((100% - 1px) * 0.5 + 0.5px)");
  expect(handleAt([1, 3], 0)).toBe("calc((100% - 1px) * 0.25 + 0.5px)");
  expect(handleBottom([1, 1], 0, 2)).toBe("0px");
  expect(handleBottom([1, 1], 1, 1)).toBe(`calc(100% - ${handleAt([1, 1], 0)} + 0.5px)`);
});

test("a drag moves one border and leaves each side at least a tenth", () => {
  expect(dragTracks([1, 1], 0, 100, 400)).toEqual([1.5, 0.5]);
  expect(dragTracks([1, 1], 0, 10000, 400)[1]).toBeCloseTo(0.2);
  expect(dragTracks([1, 1], 0, -10000, 400)[0]).toBeCloseTo(0.2);
  const t = [1, 1, 1];
  dragTracks(t, 1, 50, 300);
  expect(t).toEqual([1, 1, 1]);
});
