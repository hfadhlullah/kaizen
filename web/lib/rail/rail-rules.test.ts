import { expect, test } from "bun:test";
import { wsAgents } from "./agents.ts";
import {
  chipGroups,
  currentWs,
  filterOn,
  landingSlot,
  matchProjects,
  moveTo,
  railGroups,
  rankedOrder,
  stateOf,
  taskForCard,
  wsOfCard,
  ALLF,
  type RailData,
} from "./rules.ts";

const NOW = 1e9;
const P = "/p/.kaizen";
const main = { path: "/p", main: true, branch: "main" };
const wt = { path: "/p/.kaizen/wt/x", branch: "feat" };
const proj = (dir: string, workspaces: any[] = [main, wt]) => ({ dir, label: dir.split("/")[1], workspaces });
const run = (id: string, o: any = {}) => ({
  kind: "run",
  state: P,
  id,
  status: "building",
  column: 2,
  moved: NOW,
  ws: "/p",
  ...o,
});
const agent = (key: string, o: any = {}) => ({
  key,
  dir: P,
  ws: "/p",
  agent: "claude",
  name: "Claude",
  asking: false,
  busy: false,
  ...o,
});
const data = (o: Partial<RailData> = {}): RailData => ({
  cards: [],
  projects: [proj(P)],
  agents: [],
  tasks: null,
  ...o,
});
const o = (x: any = {}) => ({ filt: ALLF, pins: [], folded: [], open: {}, now: NOW, ...x });

test("a card's state: waiting, building, done and a linked task's own word", () => {
  expect(stateOf(run("a", { status: "waiting" }))).toBe("wait");
  expect(stateOf(run("a"))).toBe("build");
  expect(stateOf(run("a", { status: "done", accept: "needs" }))).toBe("wait");
  expect(stateOf(run("a", { status: "done" }))).toBe("done");
  const task = { id: "t", dir: P, title: "T", attention: { category: "needs-you", reason: "r", action: "a" } };
  expect(stateOf(run("a"), task)).toBe("wait");
  // a finished run keeps its own state, whatever its task says
  expect(stateOf(run("a", { status: "done" }), task)).toBe("done");
});

test("a task is found by its id or by one of its runs", () => {
  const t = { id: "t", dir: P, title: "T", runs: [{ id: "r1" }], attention: { category: "x", reason: "", action: "" } };
  expect(taskForCard({ state: P, kind: "run", id: "r1" }, [t])).toBe(t);
  expect(taskForCard({ state: P, kind: "idea", taskId: "t" }, [t])).toBe(t);
  expect(taskForCard({ state: "/o/.kaizen", kind: "run", id: "r1" }, [t])).toBeUndefined();
});

test("a card whose worktree is gone lands on the main row", () => {
  const ps = [proj(P)];
  expect(wsOfCard(run("a", { ws: wt.path }), ps)).toBe(wt.path);
  expect(wsOfCard(run("a", { ws: "/gone" }), ps)).toBe("/p");
});

test("rows: running keeps the main row and any worktree with a run; a project with nothing running stays listed", () => {
  const g = railGroups(data({ cards: [run("a", { ws: wt.path })] }), o());
  expect(g.map((x) => x.name)).toEqual(["p"]);
  expect(g[0]!.rows.map((r) => r.label)).toEqual(["main", "feat"]);
  expect(g[0]!.rows[1]!.st).toBe("build");
  expect(g[0]!.git).toBe(true);
  expect(g[0]!.mainWs).toBe("/p");
  // a worktree holding only finished runs is hidden while Running is the only kind on
  const done = railGroups(data({ cards: [run("a", { ws: wt.path, status: "done", moved: NOW })] }), o());
  expect(done[0]!.rows.map((r) => r.label)).toEqual(["main"]);
  // ...and shows with Done on
  const both = railGroups(
    data({ cards: [run("a", { ws: wt.path, status: "done" })] }),
    o({ filt: { ...ALLF, done: true } }),
  );
  expect(both[0]!.rows.map((r) => r.label)).toEqual(["main", "feat"]);
});

test("pinned worktrees come first; folded and empty projects are shut", () => {
  const g = railGroups(data({ cards: [run("a", { ws: wt.path })] }), o({ pins: [P + "\0" + wt.path] }));
  expect(g[0]!.rows.map((r) => r.label)).toEqual(["feat", "main"]);
  expect(g[0]!.rows[0]!.pinned).toBe(true);
  expect(railGroups(data(), o({ folded: [P] }))[0]!.shut).toBe(true);
  const idle = railGroups(data({ projects: [proj(P, [])] }), o());
  expect(idle).toEqual([]); // a project with no workspace is not listed at all
  const none = railGroups(data(), o({ filt: { ...ALLF, running: false, done: true } }));
  expect(none).toEqual([]);
});

test("the filter narrows to the projects ticked", () => {
  const two = data({ projects: [proj(P), proj("/q/.kaizen", [{ path: "/q", main: true }])] });
  expect(railGroups(two, o()).map((x) => x.name)).toEqual(["p", "q"]);
  expect(railGroups(two, o({ filt: { ...ALLF, dirs: ["/q/.kaizen"] } })).map((x) => x.name)).toEqual(["q"]);
});

test("a row's dot: asking agent wins, then working, then the run; agents only count when their kind is shown", () => {
  const asking = railGroups(data({ agents: [agent("a", { asking: true })] }), o());
  expect(asking[0]!.rows[0]!.st).toBe("wait");
  const working = railGroups(data({ agents: [agent("a", { busy: true })] }), o());
  expect(working[0]!.rows[0]!.st).toBe("build");
  expect(working[0]!.rows[0]!.agents.length).toBe(1);
  const doneAgent = railGroups(data({ agents: [agent("idle")] }), o());
  expect(doneAgent[0]!.rows[0]!.agents.length).toBe(0); // a done agent shows only with Done on
  expect(railGroups(data({ agents: [agent("idle")] }), o({ filt: { ...ALLF, done: true } }))[0]!.rows[0]!.st).toBe(
    "done",
  );
});

test("tasks hang under the main row until they have a run, then under that run's workspace", () => {
  const t = (id: string, o: any = {}) => ({
    id,
    dir: P,
    title: id,
    created: 1,
    status: "running",
    attention: { category: "needs-you", reason: "r", action: "a" },
    ...o,
  });
  const g = railGroups(
    data({
      tasks: [
        t("fresh"),
        t("drafty", { status: "draft" }),
        t("done", { attention: { category: "completed", reason: "", action: "" } }),
        t("old", { legacy: { kind: "run" } }),
      ],
    }),
    o(),
  );
  expect(g[0]!.rows[0]!.tasks.map((x) => x.id)).toEqual(["fresh"]);
  const withRun = railGroups(data({ cards: [run("r1", { ws: wt.path })], tasks: [t("bound", { runs: ["r1"] })] }), o());
  expect(withRun[0]!.rows.find((r) => r.label === "feat")!.tasks.map((x) => x.id)).toEqual(["bound"]);
  expect(withRun[0]!.rows[0]!.tasks).toEqual([]);
});

test("the expanded state of a workspace's agent list is read from the open map", () => {
  const g = railGroups(
    data({ agents: [agent("a", { busy: true }), agent("b", { busy: true })] }),
    o({ open: { [P + "\0/p"]: true } }),
  );
  expect(g[0]!.rows[0]!.open).toBe(true);
  expect(g[0]!.rows[1]!.open).toBe(false);
});

test("the filter button is lit when it narrows the list", () => {
  expect(filterOn(ALLF, [P])).toBe(false);
  expect(filterOn({ ...ALLF, dirs: [P] }, [P])).toBe(true);
  expect(filterOn({ ...ALLF, dirs: ["/gone"] }, [P])).toBe(false); // a project no longer listed does not count
  expect(filterOn({ ...ALLF, running: false }, [P])).toBe(true);
  expect(filterOn({ ...ALLF, done: true }, [P])).toBe(true);
  expect(matchProjects(["/a/Alpha", "/b/beta"], (d) => d.split("/").pop()!, "AL")).toEqual(["/a/Alpha"]);
});

test("a workspace's agent chips group by status, most urgent first, one chip per status", () => {
  const rows = wsAgents(
    [agent("a"), agent("b", { busy: true }), agent("c"), agent("d", { asking: true })],
    P,
    "/p",
    (c) => c.ws,
    0,
    new Map(),
  );
  expect(chipGroups(rows).map((g) => [g.st, g.rs.length])).toEqual([
    ["asking", 1],
    ["working", 1],
    ["done", 2],
  ]);
});

test("the address names the row to light: ?ws=, else the workspace of the run in ?id=", () => {
  const ps = [proj(P)];
  expect(currentWs(`?view=ws&dir=${P}&ws=/p/x`, [], ps)).toEqual({ dir: P, ws: "/p/x" });
  expect(currentWs(`?view=run&dir=${P}&id=a`, [run("a", { ws: wt.path })], ps)).toEqual({ dir: P, ws: wt.path });
  expect(currentWs("?view=board", [], ps)).toEqual({ dir: null, ws: null });
});

test("dragging a project: the slot is before the first bar whose middle is below the pointer; a drop that would not move is ignored", () => {
  const boxes = [
    { top: 0, height: 20 },
    { top: 20, height: 20 },
    { top: 40, height: 20 },
  ];
  expect(landingSlot(boxes, 5)).toBe(0);
  expect(landingSlot(boxes, 35)).toBe(2);
  expect(landingSlot(boxes, 99)).toBe(3);
  expect(moveTo(["a", "b", "c"], 0, 3)).toEqual(["b", "c", "a"]);
  expect(moveTo(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  expect(rankedOrder(["a", "b", "c"], "a", 0)).toBeNull();
  expect(rankedOrder(["a", "b", "c"], "a", 1)).toBeNull();
  expect(rankedOrder(["a", "b", "c"], "a", 3)).toEqual(["b", "c", "a"]);
  expect(rankedOrder(["a", "b"], "gone", 0)).toBeNull();
});
