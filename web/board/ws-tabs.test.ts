import { expect, test } from "bun:test";
import { loopbackUrl, toOpen, stageKeys, finished, historyOf, liveIn, migrate, wsKey } from "./ws-tabs.ts";

const run = (id: string, status: string, o: any = {}) => ({ kind: "run", state: "/p/.kaizen", id, status, moved: 1, ws: "/p", ...o });
const wsOf = (c) => c.ws;
const cards = [
  run("a", "waiting"),
  run("b", "building"),
  run("c", "done", { moved: 5 }),
  run("d", "abandoned", { moved: 9 }),
  run("e", "done", { accept: "needs" }), // finished, waiting on an approval: still a tab
  run("f", "building", { ws: "/p/.kaizen/wt/x" }),
  run("g", "done", { moved: 7, archived: true }),
  { kind: "idea", state: "/p/.kaizen", text: "t", kind: "run", pty: { key: "k" }, ws: "/p" },
  { kind: "idea", state: "/p/.kaizen", text: "no agent", ws: "/p" },
];

test("live runs get a tab; an idea only with its agent; a run waiting on approval stays", () => {
  expect(liveIn(cards, "/p/.kaizen", "/p", wsOf).map((c) => c.id ?? c.text)).toEqual(["a", "b", "e", "t"]);
  expect(liveIn(cards, "/p/.kaizen", "/p/.kaizen/wt/x", wsOf).map((c) => c.id)).toEqual(["f"]);
  expect(finished(cards[4])).toBe(false);
});

test("History: done and abandoned runs of the workspace, newest first, nothing else", () => {
  expect(historyOf(cards, "/p/.kaizen", "/p", wsOf).map((c) => c.id)).toEqual(["d", "g", "c"]);
  expect(historyOf(cards, "/p/.kaizen", "/p/.kaizen/wt/x", wsOf)).toEqual([]);
});

test("migrate: a run's saved layout moves to its workspace; unknown keys stay; nothing is lost", () => {
  const key = (c) => (c.kind === "idea" ? "idea:" + c.state + ":" + c.text : "run:" + c.state + ":" + c.id);
  const all: any = {
    "run:/p/.kaizen:a": { tabs: [{ id: "local" }], hidden: ["agent:1"], screens: [{ id: "s1", tree: "local", focus: "local" }], on: "s1" },
    "run:/p/.kaizen:b": { tabs: [{ id: "local" }, { id: "preview" }], hidden: [], screens: [{ id: "s2", tree: { dir: "cols", kids: ["local", "preview"], sizes: [1, 1] }, focus: "local" }], on: "s2" },
    "run:/p/.kaizen:gone": { tabs: [{ id: "note:x" }], hidden: [], screens: [], on: null },
    "kz-other": { tabs: [], hidden: [], screens: [], on: null },
  };
  expect(migrate(all, cards, key, wsOf)).toBe(true);
  const to = all[wsKey("/p/.kaizen", "/p")];
  expect(to.tabs.map((t) => t.id)).toEqual(["local", "preview"]);
  expect(to.hidden).toEqual(["agent:1"]);
  // "local" is in the first screen already: the second keeps only "preview"
  expect(to.screens.map((s) => s.tree)).toEqual(["local", "preview"]);
  expect(to.on).toBe("s1");
  expect(Object.keys(all).sort()).toEqual(["kz-other", "run:/p/.kaizen:gone", wsKey("/p/.kaizen", "/p")].sort());
  expect(migrate(all, cards, key, wsOf)).toBe(false); // once
});

import { awaiting, hiddenRuns } from "./ws-tabs.ts";
test("awaiting: waiting, accept-needed and asking runs are not closable; a building run is", () => {
  expect(awaiting(run("a", "waiting"))).toBe(true);
  expect(awaiting(run("e", "done", { accept: "needs" }))).toBe(true);
  expect(awaiting(run("p", "building", { kind: "run", pty: { alive: true, asking: true } }))).toBe(true);
  expect(awaiting(run("b", "building"))).toBe(false);
  expect(awaiting(run("c", "done"))).toBe(false);
});
test("hiddenRuns: live runs whose tab is hidden come back in the + menu", () => {
  const live = liveIn(cards, "/p/.kaizen", "/p", wsOf);
  expect(hiddenRuns(live, ["rn:b", "agent:x"], (c) => c.id).map((c) => c.id)).toEqual(["b"]);
  expect(hiddenRuns(live, [], (c) => c.id)).toEqual([]);
});

test("stageKeys: recorded impl/review terminals; plan is the unclaimed first agent until a stage is launched", () => {
  expect(stageKeys({ kind: "run", pty: { all: ["a"] } })).toEqual({ plan: "a" });
  expect(stageKeys({ kind: "run", pty: { all: ["a", "b"], stages: { impl: "b" } } })).toEqual({ impl: "b" });
  expect(stageKeys({ kind: "run", pty: { all: ["b", "c"], stages: { impl: "b", review: "c" } } })).toEqual({ impl: "b", review: "c" });
  expect(stageKeys({ kind: "run", pty: { all: ["x"], stages: { impl: "gone" } } })).toEqual({});
  expect(stageKeys({ kind: "run", pty: { all: ["p", "b"], stages: { plan: "p", impl: "b" } } })).toEqual({ plan: "p", impl: "b" });
  expect(stageKeys({ kind: "run", pty: { all: ["p", "x"], stages: { plan: "p" } } })).toEqual({ plan: "p" });
  expect(stageKeys({ kind: "idea", pty: { all: ["a"] } })).toEqual({});
});

test("loopbackUrl: the first localhost address in a Preview; other hosts and none give undefined", () => {
  expect(loopbackUrl("Run `bun dev`, open http://localhost:5173/app) now")).toBe("http://localhost:5173/app");
  expect(loopbackUrl("see [x](http://127.0.0.1:8080)")).toBe("http://127.0.0.1:8080");
  expect(loopbackUrl("http://[::1]:3000/")).toBe("http://[::1]:3000/");
  expect(loopbackUrl("https://example.com/ and ![shot](a.png)")).toBeUndefined();
  expect(loopbackUrl(null)).toBeUndefined();
});

test("toOpen: a run that moves into review or done opens the Browser once; others do not", () => {
  const cs = [run("a", "running", { column: 2 }), run("b", "waiting", { column: 3 }), run("c", "done", { column: 4 }), run("e", "abandoned", { column: 4 })];
  const key = (c) => c.id;
  expect(toOpen(cs, new Set(), [], key).map(key)).toEqual(["b", "c"]);
  expect(toOpen(cs, new Set(["b"]), [], key).map(key)).toEqual(["c"]); // b was already reviewing
  expect(toOpen(cs, new Set(), ["c"], key).map(key)).toEqual(["b"]); // c already opened once
});
