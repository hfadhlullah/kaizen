import { expect, test } from "bun:test";
import { closes, dragging } from "./sheet-swipe.ts";

test("a finger's drift in a tap is not a drag", () => {
  expect(dragging(4)).toBe(false);
  expect(dragging(10)).toBe(false);
  expect(dragging(11)).toBe(true);
});

test("a long pull or a quick flick closes the sheet; a short slow one springs back", () => {
  expect(closes(101, 900)).toBe(true);
  expect(closes(40, 200)).toBe(true);
  expect(closes(40, 400)).toBe(false);
  expect(closes(20, 100)).toBe(false);
  expect(closes(100, 900)).toBe(false);
});
