import { expect, test } from "bun:test";
import { keyboardViewport } from "./terminal-viewport.ts";

test("raw terminal and composer focus fit the keyboard's visible viewport", () => {
  expect(keyboardViewport(490.4, 844, 1, true)).toBe(490);
  expect(keyboardViewport(844, 844, 1, true)).toBeNull();
  expect(keyboardViewport(800, 844, 1, true)).toBeNull();
  expect(keyboardViewport(490, 844, 1, false)).toBeNull();
  expect(keyboardViewport(490, 844, 1.5, true)).toBeNull();
});
