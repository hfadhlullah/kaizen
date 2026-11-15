import { test, expect } from "bun:test";
import {
  areaBigEnough,
  areaLabel,
  buildNote,
  composerPos,
  cropScales,
  cropWindow,
  goodClass,
  insideArea,
  markerPos,
  quote,
  rectOf,
  tipPos,
  tooBig,
  union,
  type Rect,
} from "./page.ts";

const R = (left: number, top: number, width: number, height: number): Rect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

test("generated class names stay out of selectors", () => {
  expect(goodClass("btn-primary")).toBe(true);
  for (const c of ["css-1x2y3z", "_foo", "sc-abc", "jsx-123", "a1234", "a".repeat(24)])
    expect(goodClass(c)).toBe(false);
});

test("a union of rectangles and the rectangle of an area drag, whichever way it was dragged", () => {
  expect(union([R(10, 10, 10, 10), R(50, 5, 10, 10)])).toEqual({
    left: 10,
    top: 5,
    right: 60,
    bottom: 20,
    width: 50,
    height: 15,
  });
  expect(rectOf({ x0: 30, y0: 40, x1: 10, y1: 15 })).toEqual(R(10, 15, 20, 25));
});

test("an area needs 8 x 8; an element is in it when it is not tiny and fits, with a pixel of slack", () => {
  expect(areaBigEnough(R(0, 0, 8, 8))).toBe(true);
  expect(areaBigEnough(R(0, 0, 7, 20))).toBe(false);
  const area = R(100, 100, 200, 200);
  expect(insideArea(R(101, 101, 50, 50), area)).toBe(true);
  expect(insideArea(R(99, 99, 50, 50), area)).toBe(true);
  expect(insideArea(R(98, 100, 50, 50), area)).toBe(false);
  expect(insideArea(R(120, 120, 3, 50), area)).toBe(false);
  expect(insideArea(R(120, 120, 150, 200), area)).toBe(false);
});

test("labels quote the text or fall back to the tag", () => {
  expect(quote("  Hello \n world ", "div.x")).toBe('"Hello world"');
  expect(quote("", "div.x")).toBe("div.x");
  expect(quote("x".repeat(70), "d")).toBe(`"${"x".repeat(60)}…"`);
  expect(areaLabel(R(0, 0, 100.4, 50.6), 3)).toBe("area 100x51 (3 elements)");
});

test("the note box opens below a pick with room and above one without, always inside the window", () => {
  expect(composerPos(R(100, 100, 50, 20), 1000, 800)).toEqual({ left: 100, top: 128 });
  expect(composerPos(R(900, 600, 50, 20), 1000, 800)).toEqual({ left: 684, top: 410 });
  expect(composerPos(R(-40, 0, 10, 10), 1000, 800).left).toBe(8);
  expect(composerPos(R(0, 5, 10, 10), 1000, 300).top).toBe(8);
});

test("a marker sits at the top right of what it marks, its tip under the block", () => {
  expect(markerPos(R(10, 5, 100, 50), 1000)).toEqual({ left: 110, top: 12 });
  expect(markerPos(R(950, 100, 100, 50), 1000)).toEqual({ left: 988, top: 100 });
  expect(tipPos(R(10, 100, 100, 50), 1000, 800)).toEqual({ left: 10, top: 158 });
  expect(tipPos(R(10, 780, 100, 50), 1000, 800).top).toBe(710);
});

test("a note holds the pick's facts, its box in page pixels, and only a multi pick lists its items", () => {
  const facts = {
    selector: "#a",
    items: ["#a", "#b"],
    path: "html > body",
    text: "t".repeat(300),
    tag: "div",
    url: "http://x/",
    page: "/",
    attrs: "",
    styles: "",
    nearby: "",
    source: "",
    components: "",
  };
  const one = buildNote(
    { kind: "element", rect: R(10, 20, 30, 40), count: 1 },
    facts,
    { comment: "c", intent: "fix", severity: "important" },
    { x: 5, y: 100 },
  );
  expect(one.box).toBe("15,120 30x40");
  expect(one.pb).toEqual({ x: 15, y: 120, w: 30, h: 40 });
  expect(one.items).toEqual([]);
  expect(one.text.length).toBe(200);
  expect(one.selected).toBe("");
  const many = buildNote(
    { kind: "multi", rect: R(0, 0, 1, 1), count: 2, selected: "s" },
    facts,
    { comment: "c", intent: "fix", severity: "important" },
    { x: 0, y: 0 },
  );
  expect(many.items).toEqual(["#a", "#b"]);
  expect(many.selected).toBe("s");
});

test("the picture is skipped when the element is too big or too small, else cropped to what was picked", () => {
  expect(tooBig({ width: 2401, height: 10 })).toBe(true);
  expect(cropWindow(R(0, 0, 3000, 100), R(0, 0, 50, 50))).toBeNull();
  expect(cropWindow(R(0, 0, 1, 100), R(0, 0, 50, 50))).toBeNull();
  expect(cropWindow(R(100, 100, 400.2, 200), R(150, 120, 100, 50))).toEqual({
    w: 401,
    h: 200,
    sx: 50,
    sy: 20,
    sw: 100,
    sh: 50,
  });
  expect(cropWindow(R(100, 100, 400, 200), R(50, 50, 100, 100))).toEqual({
    w: 400,
    h: 200,
    sx: 0,
    sy: 0,
    sw: 100,
    sh: 100,
  });
  expect(cropWindow(R(100, 100, 400, 200), R(500, 100, 10, 10))).toBeNull();
});

test("the scales to try run from the pixel ratio (at most 2) down to 0.5 and never pass 1600 px", () => {
  expect(cropScales(100, 100, 3)).toEqual([2, 1.5, 1, 0.5]);
  expect(cropScales(100, 100, 1)).toEqual([1, 0.5]);
  expect(cropScales(100, 100, 0)).toEqual([1, 0.5]);
  expect(cropScales(2000, 100, 2)).toEqual([0.8, 0.8, 0.8, 0.5]);
});
