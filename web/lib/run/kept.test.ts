import { expect, test } from "bun:test";
import { evict, keepKeys, liveKeys, pruneDead, touch, type Kept } from "./kept.ts";

const t = (key: string) => ({ id: "sh:" + key, kind: "shell", title: key, key });
const w = (n: number, extra: any[] = []) => ({ items: [...Array.from({ length: n }, (_, i) => t(`s${i}`)), ...extra], ws: { dir: "d", ws: "w" } });
const mk = (spec: Record<string, number>): Kept => Object.fromEntries(Object.entries(spec).map(([k, n]) => [k, w(n)]));

test("touch moves a workspace to the end of the recent list", () => {
  expect(touch(["a", "b", "c"], "a")).toEqual(["b", "c", "a"]);
  expect(touch([], "a")).toEqual(["a"]);
});

test("the workspace cap keeps the shown one and the most recently visited", () => {
  const kept = mk({ a: 1, b: 1, c: 1, d: 1, e: 1, f: 1 });
  expect([...keepKeys(kept, ["a", "b", "c", "d", "e", "f"], "c")].sort()).toEqual(["c", "d", "e", "f"]);
  expect(Object.keys(evict(kept, ["a", "b", "c", "d", "e", "f"], "a")).sort()).toEqual(["a", "d", "e", "f"]);
  const same = mk({ a: 1, b: 1 });
  expect(evict(same, ["a", "b"], "b")).toBe(same); // nothing over the cap: the same object
});

test("the terminal cap drops older workspaces, never the shown one, and stops at the first that does not fit", () => {
  const kept = mk({ a: 3, b: 6, c: 5, d: 1 });
  // shown a (3) + d (1) + c (5) = 9; b (6) would make 15 > 12, so it goes
  expect([...keepKeys(kept, ["b", "c", "d", "a"], "a")].sort()).toEqual(["a", "c", "d"]);
  // a recent big workspace is not skipped for an older small one: c (5) does not fit after 12, d never comes back in
  const big = mk({ a: 12, b: 1, c: 1 });
  expect([...keepKeys(big, ["c", "b", "a"], "a")]).toEqual(["a"]);
  // the shown workspace stays even when it alone is over the cap
  expect([...keepKeys(mk({ a: 20, b: 1 }), ["b", "a"], "a")]).toEqual(["a"]);
  // panes that are not terminals do not count against the terminal cap
  const frames = { a: w(0, [{ id: "local", kind: "local", title: "Browser" }]), b: w(12) };
  expect([...keepKeys(frames, ["b", "a"], "a")].sort()).toEqual(["a", "b"]);
});

test("no shown workspace (another page) keeps the most recent ones", () => {
  const kept = mk({ a: 1, b: 1, c: 1, d: 1, e: 1 });
  expect(Object.keys(evict(kept, ["a", "b", "c", "d", "e"], null)).sort()).toEqual(["b", "c", "d", "e"]);
  // a key missing from the recent list is the oldest
  expect(Object.keys(evict(mk({ a: 1, b: 1, c: 1, d: 1, e: 1 }), ["b", "c", "d", "e"], null)).sort()).toEqual(["b", "c", "d", "e"]);
});

test("a dead session's terminal is pruned from a hidden workspace; frames, the shown workspace and live ones stay", () => {
  const frame = { id: "local", kind: "local", title: "Browser" };
  const kept: Kept = { a: w(2, [frame]), b: w(2) };
  const live = liveKeys([{ key: "s0" }], [{ key: "s1" }], []);
  expect(pruneDead(kept, live, null)).toBe(kept); // everything alive
  const gone = pruneDead(kept, new Set(["s0"]), "b");
  expect(gone.a!.items.map((i) => i.id)).toEqual(["sh:s0", "local"]); // s1 pruned, Browser stays
  expect(gone.b).toBe(kept.b); // the shown workspace is left to its own redraw
  // pty keys of cards and agents count as alive
  expect([...liveKeys([], [{ key: "x" }], [{ pty: { key: "p", all: ["q"] } }, {}])].sort()).toEqual(["p", "q", "x"]);
});
