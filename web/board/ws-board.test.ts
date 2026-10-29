import { expect, test } from "bun:test";
import { cardLine, columnOf, groupWs } from "./ws-board.ts";

const D = "/p/.kaizen";
const run = (id: string, status: string, o: any = {}) => ({ kind: "run", state: D, id, status, moved: 1, column: 1, ws: "/p", ...o });
const wsOf = (c) => c.ws;
// stateOf as workspace.ts has it, for the fields these tests use.
const stateOf = (c) =>
  c.kind === "idea" ? (c.pty?.asking ? "wait" : "idle")
  : c.status === "waiting" || (c.pty?.alive && c.pty.asking) ? "wait"
  : c.status === "done" ? (c.accept === "needs" ? "wait" : "done")
  : c.status === "abandoned" ? "aband" : c.status === "stalled" ? "stalled"
  : c.column >= 3 ? "review" : c.column === 2 ? "build" : "plan";
const col = (cs: any[], ws = "/p") => columnOf(cs, D, ws, wsOf, stateOf).col;

test("no runs, only ideas, an asking idea: Todo", () => {
  expect(col([])).toBe(0);
  expect(col([{ kind: "idea", state: D, text: "t", ws: "/p" }])).toBe(0);
  expect(col([{ kind: "idea", state: D, text: "t", ws: "/p", pty: { alive: true, asking: true } }])).toBe(0);
});
test("building, planning: In progress; stalled too", () => {
  expect(col([run("a", "building", { column: 2 })])).toBe(1);
  expect(col([run("a", "planning", { column: 1 })])).toBe(1);
  expect(col([run("a", "stalled", { column: 2 })])).toBe(1);
});
test("waiting on approval, done not accepted, running review: In review", () => {
  expect(col([run("a", "waiting", { awaiting: "plan" })])).toBe(2);
  expect(col([run("a", "done", { accept: "needs" })])).toBe(2);
  expect(col([run("a", "running", { column: 3 })])).toBe(2);
});
test("one run waiting and one building: In review", () => {
  expect(col([run("a", "building", { column: 2 }), run("b", "waiting")])).toBe(2);
});
test("done clean: Done; a new building run after it: In progress", () => {
  expect(col([run("a", "done")])).toBe(3);
  expect(col([run("a", "done"), run("b", "building", { column: 2 })])).toBe(1);
});
test("abandoned only: Todo; newest finished abandoned over an older done: Todo", () => {
  expect(col([run("a", "abandoned")])).toBe(0);
  expect(col([run("a", "done", { moved: 1 }), run("b", "abandoned", { moved: 2 })])).toBe(0);
});
test("archived done still counts: Done; a new run there moves it", () => {
  expect(col([run("a", "done", { archived: true })])).toBe(3);
  expect(col([run("a", "done", { archived: true }), run("b", "building", { column: 2 })])).toBe(1);
});
test("another workspace's runs do not count", () => {
  expect(col([run("a", "building", { ws: "/p/wt" })])).toBe(0);
  expect(col([run("a", "building", { column: 2, ws: "/p/wt" })], "/p/wt")).toBe(1);
});
test("groupWs: a card whose worktree is gone lands on the main checkout; unlisted projects fall back to cards", () => {
  const projects = [{ dir: D, workspaces: [{ path: "/p", main: true }, { path: "/p/wt" }] }];
  const wsOfP = (c) => (c.ws === "/p/wt" || c.ws === "/p" ? c.ws : "/p");
  const cs = [run("a", "building", { ws: "/gone" }), run("b", "building", { ws: "/p/wt" })];
  const g = groupWs(cs, projects, wsOfP);
  expect(g.map((e) => [e.w.path, e.cs.length])).toEqual([["/p", 1], ["/p/wt", 1]]);
  const f = groupWs([run("x", "done", { state: "/q/.kaizen", ws: "/q" })], projects, wsOf);
  expect(f.map((e) => [e.dir, e.w.path])).toEqual([[D, "/p"], [D, "/p/wt"], ["/q/.kaizen", "/q"]]);
});
test("groupWs: a card with no workspace in a listed project goes to the main checkout, or its own row", () => {
  const c = run("a", "building", { ws: "" });
  const g = (ws) => groupWs([c], [{ dir: D, workspaces: ws }], wsOf).map((e) => [e.w.path, e.cs.length]);
  expect(g([{ path: "/p", main: true }, { path: "/p/wt" }])).toEqual([["/p", 1], ["/p/wt", 0]]);
  expect(g([{ path: "/p/wt" }])).toEqual([["/p/wt", 0], ["", 1]]);
});
test("cardLine: waiting on you says so with what it waits for", () => {
  expect(cardLine(run("a", "waiting", { awaiting: "plan" }), "wait", "planning · plan approval")).toBe("waiting on you · plan approval");
  expect(cardLine(run("a", "waiting"), "wait", "waiting on you")).toBe("waiting on you");
  expect(cardLine(run("a", "planning"), "wait", "planning · 5m")).toBe("waiting on you");
  expect(cardLine(run("a", "building"), "build", "building · 5m")).toBe("building · 5m");
  expect(cardLine(undefined, "", "")).toBe("no runs");
});
