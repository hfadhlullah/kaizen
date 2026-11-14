import { expect, test } from "bun:test";
import { FONT_BASE, FONT_MAX, FONT_MIN, fontStep } from "./term-font.ts";

const key = (code: string, mods = {}) => ({ code, shiftKey: false, altKey: false, ctrlKey: true, metaKey: false, ...mods });

test("font keys step within the bounds", () => {
  expect(fontStep(12, key("Equal"))).toBe(13);
  expect(fontStep(12, key("Equal", { shiftKey: true }))).toBe(13);
  expect(fontStep(12, key("Minus", { shiftKey: true }))).toBe(11);
  expect(fontStep(12, key("Minus"))).toBe(11);
  expect(fontStep(FONT_MAX, key("Equal"))).toBe(FONT_MAX);
  expect(fontStep(FONT_MIN, key("Minus", { shiftKey: true }))).toBe(FONT_MIN);
  expect(fontStep(20, key("Digit0"))).toBe(FONT_BASE);
  expect(fontStep(12, key("Equal", { ctrlKey: false, metaKey: true }))).toBe(13);
});

test("other keys stay with the terminal", () => {
  expect(fontStep(12, key("Minus", { altKey: true }))).toBeNull();
  expect(fontStep(12, key("Equal", { ctrlKey: false }))).toBeNull();
  expect(fontStep(12, key("Equal", { altKey: true }))).toBeNull();
  expect(fontStep(12, key("KeyA"))).toBeNull();
});
