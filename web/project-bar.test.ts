import { expect, test } from "bun:test";
import { isAction, showingCount, showingLabel } from "./lib/project-bar.ts";

const all = [{ dir: "a" }, { dir: "b" }, { dir: "c" }];

test("the Showing button counts the projects that are on", () => {
  expect(showingLabel([], all)).toBe("Showing all");
  expect(showingLabel(["b"], all)).toBe("Showing 1 of 3");
  // A folder that is no longer listed does not count.
  expect(showingLabel(["gone"], all)).toBe("Showing all");
});

test("the line under the list says the same in words", () => {
  expect(showingCount([], all)).toBe("All 3 shown");
  expect(showingCount(["a", "c"], all)).toBe("2 of 3 shown");
});

test("the picker's three actions are told from projects", () => {
  expect(["__new", "__find", "__clone"].every(isAction)).toBe(true);
  expect(isAction("all") || isAction("/p/.kaizen")).toBe(false);
});
