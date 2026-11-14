import { beforeEach, expect, test } from "bun:test";

// The store keeps its choices in this browser: a fake localStorage before it loads.
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
};
const { foldProject, foldProjects, orderProjects, setRailData, setRailFilter, togglePin, toggleAgents, useRail } =
  await import("./rail-store.ts");

beforeEach(() => mem.clear());

test("the filter, folds, pins and open agent lists are kept under the old keys", () => {
  setRailFilter({ dirs: ["/p"] });
  expect(JSON.parse(mem.get("kz-rail-filter2")!)).toEqual({ dirs: ["/p"], running: true, done: false });
  foldProject("/p");
  foldProjects(["/q", "/r"], true);
  expect(useRail.getState().folded).toEqual(["/p", "/q", "/r"]);
  foldProject("/p");
  foldProjects(["/q", "/r"], false);
  expect(JSON.parse(mem.get("kz-rail-folded")!)).toEqual([]);
  togglePin("/p", "/p/wt");
  expect(JSON.parse(mem.get("kz-ws-pins")!)).toEqual(["/p\0/p/wt"]);
  togglePin("/p", "/p/wt");
  expect(useRail.getState().pins).toEqual([]);
  toggleAgents("/p", "/p");
  expect(JSON.parse(mem.get("kz-wsopen")!)).toEqual({ "/p\0/p": true });
  toggleAgents("/p", "/p");
  expect(useRail.getState().open).toEqual({});
});

test("a dropped project shows in its new place at once; data refreshes replace the cards", () => {
  setRailData({ cards: [], projects: [{ dir: "a" }, { dir: "b" }, { dir: "c" }], agents: [], tasks: null });
  orderProjects(["c", "a", "b"]);
  expect(useRail.getState().data.projects.map((p) => p.dir)).toEqual(["c", "a", "b"]);
  setRailData({ cards: [{ id: 1 }], projects: [], agents: [], tasks: null });
  expect(useRail.getState().data.cards.length).toBe(1);
});
