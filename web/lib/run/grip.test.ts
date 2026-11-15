import { expect, test } from "bun:test";
import { gripWidth } from "./grip.ts";

test("the panel is never narrower than 260 px and never wider than 60% of the window (or 260 on a small one)", () => {
  expect(gripWidth(100, 1400)).toBe(260);
  expect(gripWidth(500, 1400)).toBe(500);
  expect(gripWidth(5000, 1400)).toBe(840);
  expect(gripWidth(5000, 300)).toBe(260);
  expect(gripWidth(400.6, 1400)).toBe(401);
});
