import { expect, test } from "bun:test";
import { imageFiles, pathsText } from "./term-paste.ts";

test("only images are taken from a paste or drop", () => {
  const f = (type: string) => ({ type });
  expect(imageFiles([f("image/png"), f("text/plain"), f("image/jpeg"), f("")])).toEqual([f("image/png"), f("image/jpeg")]);
  expect(imageFiles(null)).toEqual([]);
});

test("saved paths are typed space-separated, quoted when they hold a space, refused ones skipped", () => {
  expect(pathsText(["/home/a/.kaizen/term-images/x.png"])).toBe("/home/a/.kaizen/term-images/x.png ");
  expect(pathsText(["C:\\Users\\Jane Doe\\.kaizen\\term-images\\x.png", "", "C:\\k\\y.png"])).toBe('"C:\\Users\\Jane Doe\\.kaizen\\term-images\\x.png" C:\\k\\y.png ');
  expect(pathsText(["", ""])).toBe("");
});
