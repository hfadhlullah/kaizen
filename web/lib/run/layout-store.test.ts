import { beforeEach, expect, test } from "bun:test";
import {
  clean,
  focusItem,
  layoutOf,
  moveInLayout,
  patch,
  placeItems,
  resizeAt,
  selectScreen,
  setTarget,
  showItem,
  useLayout,
} from "./layout-store.ts";

beforeEach(() => useLayout.setState({ all: {}, target: null, dragging: null }));

test("clean drops the run tabs and hidden run keys, and a broken screen list", () => {
  const s = clean({
    tabs: [
      { id: "r", kind: "run", title: "x" },
      { id: "local", kind: "local", title: "Browser" },
    ],
    hidden: ["rn:1", "agent:a"],
    screens: [{ id: "s", tree: "" as any, focus: "" }],
  });
  expect(s.tabs.map((t) => t.id)).toEqual(["local"]);
  expect(s.hidden).toEqual(["agent:a"]);
  expect(s.screens).toEqual([]);
});

test("placeItems puts each item in a screen, a split target puts the next beside the focused pane, and only a change is a new record", () => {
  placeItems("w", ["a"]);
  const first = layoutOf("w");
  expect(first.screens).toHaveLength(1);
  expect(first.on).toBe(first.screens[0]!.id);
  placeItems("w", ["a"]);
  expect(layoutOf("w")).toBe(first);
  setTarget({ screen: first.on!, dir: "rows" });
  placeItems("w", ["a", "b"]);
  expect(layoutOf("w").screens[0]!.tree).toEqual({ dir: "rows", kids: ["a", "b"], sizes: [1, 1] });
  expect(useLayout.getState().target).toBeNull();
});

test("select, focus, show, move and resize change one screen of one workspace", () => {
  placeItems("w", ["a", "b"]);
  const [s1, s2] = layoutOf("w").screens;
  selectScreen("w", s2!.id);
  expect(layoutOf("w").on).toBe(s2!.id);
  showItem("w", "a");
  expect(layoutOf("w").on).toBe(s1!.id);
  expect(moveInLayout("w", "b", s1!.id, { pane: "a", dir: "cols", before: false })).toBe(true);
  const sc = layoutOf("w").screens[0]!;
  expect(layoutOf("w").screens).toHaveLength(1);
  focusItem("w", "a");
  expect(layoutOf("w").screens[0]!.focus).toBe("a");
  resizeAt("w", sc.id, [], 1, 0.25);
  expect((layoutOf("w").screens[0]!.tree as any).sizes).toEqual([0.5, 1.5]);
  expect(layoutOf("other")).toEqual({ tabs: [], hidden: [], screens: [], on: null });
});

test("patch with the same record changes nothing", () => {
  patch("w", (s) => ({ ...s, hidden: ["x"] }));
  const before = useLayout.getState().all;
  patch("w", (s) => s);
  expect(useLayout.getState().all).toBe(before);
});
