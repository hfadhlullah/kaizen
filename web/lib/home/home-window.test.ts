import { expect, test } from "bun:test";
import {
  clampPlace,
  currentTab,
  homeTabs,
  isDrag,
  markOf,
  readPlace,
  restoredState,
  type HomeShell,
} from "./home-window.ts";

const sh = (key: string, run = "home"): HomeShell => ({ key, run, title: key });

test("the tabs are the Home terminals the server lists, less those asked to exit", () => {
  const list = [sh("a"), sh("b", "other"), sh("c"), sh("d")];
  expect(homeTabs(list, []).map((t) => t.key)).toEqual(["a", "c", "d"]);
  expect(homeTabs(list, ["c"]).map((t) => t.key)).toEqual(["a", "d"]);
});

test("the tab shown is the one asked for, else the last, else none", () => {
  const tabs = [sh("a"), sh("b")];
  expect(currentTab(tabs, "a")).toBe("a");
  expect(currentTab(tabs, "gone")).toBe("b");
  expect(currentTab(tabs, "")).toBe("b");
  expect(currentTab([], "a")).toBe("");
});

test("a dragged spot stays inside the window", () => {
  expect(clampPlace({ x: -20, y: -5 }, 300, 1000, 800)).toEqual({ x: 0, y: 0 });
  expect(clampPlace({ x: 900, y: 790 }, 300, 1000, 800)).toEqual({ x: 700, y: 760 });
  expect(clampPlace({ x: 120, y: 80 }, 300, 1000, 800)).toEqual({ x: 120, y: 80 });
});

test("a saved spot is read only when it is two numbers", () => {
  expect(readPlace('{"x":10,"y":20}')).toEqual({ x: 10, y: 20 });
  expect(readPlace('{"x":"10","y":20}')).toBeNull();
  expect(readPlace("nope")).toBeNull();
  expect(readPlace(null)).toBeNull();
});

test("a press that moved 4 px is a drag, a finger's wobble is a tap", () => {
  expect(isDrag(1, 2)).toBe(false);
  expect(isDrag(3, 3)).toBe(true);
  expect(isDrag(0, 4)).toBe(true);
});

test("the window comes back on a page load only on a computer, only open or minimized", () => {
  expect(restoredState("open", false)).toBe("open");
  expect(restoredState("min", false)).toBe("min");
  expect(restoredState("closed", false)).toBeNull();
  expect(restoredState("open", true)).toBeNull();
  expect(restoredState(null, false)).toBeNull();
});

test("an agent shows its own mark when the sprite has one", () => {
  expect(markOf("claude")).toBe("claude");
  expect(markOf("aider")).toBe("ai");
  expect(markOf(undefined)).toBe("ai");
});
