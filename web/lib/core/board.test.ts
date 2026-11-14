// The Board's card rules (web/lib/core/board.ts) without a browser: which cards a column lists and in what order, the
// button a card carries, and the chips and marks on its foot.
import { expect, test } from "bun:test";
import {
  actionOf,
  backlogCards,
  cardKey,
  chipsAndMarks,
  columnCards,
  isNested,
  kidsOf,
  olderThan,
  type Card,
} from "./board.ts";

const run = (id: string, o: Partial<Card> = {}): Card => ({
  kind: "run",
  state: "/p",
  where: "/p",
  id,
  text: id,
  column: 1,
  status: "running",
  moved: 1,
  ...o,
});
const task = (text: string, o: Partial<Card> = {}): Card => ({
  kind: "idea",
  state: "/p",
  where: "/p",
  text,
  column: 0,
  status: "idea",
  added: 1,
  ...o,
});
const cut = (cards: Card[], o: Record<string, unknown> = {}) =>
  columnCards({
    cards,
    backlog: [],
    ci: 1,
    archive: false,
    filter: null,
    query: "",
    tab: "ideas",
    sev: null,
    order: {},
    all: cards,
    ...o,
  });

test("a column lists waiting runs first, then newest first, or oldest first when asked", () => {
  const a = run("a", { moved: 1 }),
    b = run("b", { moved: 3 }),
    c = run("c", { moved: 2, status: "waiting" });
  expect(cut([a, b, c]).map((x) => x.id)).toEqual(["c", "b", "a"]);
  expect(cut([a, b, c], { order: { 1: "old" } }).map((x) => x.id)).toEqual(["c", "a", "b"]);
});
test("tasks sort by when they were added, ties by inbox position", () => {
  const x = task("x", { added: 5 }),
    y = task("y", { added: 5 }),
    z = task("z", { added: 9 });
  expect(cut([x, y, z], { ci: 0 }).map((t) => t.text)).toEqual(["z", "y", "x"]);
});
test("status filter, search and the archive view narrow a column", () => {
  const a = run("alpha-run"),
    b = run("beta-run", { status: "stalled" }),
    gone = run("old-run", { archived: true });
  const cards = [a, b, gone];
  expect(cut(cards, { filter: "stalled" }).map((x) => x.id)).toEqual(["beta-run"]);
  expect(cut(cards, { query: "ALPHA" }).map((x) => x.id)).toEqual(["alpha-run"]);
  // The page hands over the cards of the view shown (archived or not); the archive view keeps nested ones.
  expect(cut([gone], { archive: true }).map((x) => x.id)).toEqual(["old-run"]);
});
test("a card filed by a run sits inside it until the parent is done, archived or gone", () => {
  const parent = run("parent"),
    kid = task("kid", { parent: "parent", column: 1 });
  expect(isNested([parent, kid], kid)).toBe(true);
  expect(kidsOf([parent, kid], parent)).toEqual([kid]);
  expect(cut([parent, kid]).map((x) => x.id ?? x.text)).toEqual(["parent"]);
  expect(isNested([{ ...parent, column: 4 }, kid], kid)).toBe(false);
  expect(isNested([{ ...parent, archived: true }, kid], kid)).toBe(false);
  expect(isNested([kid], kid)).toBe(false);
});
test("the Backlog tab lists open backlog items by severity, in file order", () => {
  const items = backlogCards([
    { state: "/p", where: "/p", source: "s1", n: 1, text: "one", severity: "high" },
    { state: "/p", where: "/p", source: "s1", n: 2, text: "two", severity: "low" },
    { state: "/p", where: "/p", source: "s2", n: 1, text: "three", starting: true },
  ]);
  expect(items.map(cardKey)).toEqual(["backlog:/p:s1#1", "backlog:/p:s1#2", "backlog:/p:s2#1"]);
  expect(items[2]!.status).toBe("starting");
  const list = (o: Record<string, unknown>) =>
    cut([], { ci: 0, tab: "backlog", backlog: items, ...o }).map((x) => x.text);
  expect(list({})).toEqual(["one", "two", "three"]);
  expect(list({ sev: "high" })).toEqual(["one"]);
  expect(list({ sev: "none" })).toEqual(["three"]);
});
test("a repeated task text gets its own key from load()", () => {
  expect(cardKey(task("same"))).toBe("idea:/p:same");
  expect(cardKey({ ...task("same"), _k: "idea:/p:same#1" })).toBe("idea:/p:same#1");
  expect(cardKey(run("r1"))).toBe("run:/p:r1");
});
test("what a card's button says follows what the run waits on", () => {
  const w = (awaiting: string, o: Partial<Card> = {}) =>
    actionOf(run("r", { status: "waiting", awaiting, ...o }), false);
  expect(w("approvals.plan")).toBe("Review plan");
  expect(w("approvals.review")).toBe("Review work");
  expect(w("findings")).toBe("See findings");
  expect(w("explore")).toBe("Review exploration");
  expect(w("approvals.review", { healed: true })).toBe("Approve");
  expect(actionOf(run("r"), false)).toBe("Open");
  expect(actionOf(run("r", { status: "waiting", awaiting: "approvals.plan" }), true)).toBe("Sent to agent");
});
test("Clear counts the done cards older than a number of days", () => {
  const now = 10 * 86400e3,
    old = run("old", { moved: now - 8 * 86400e3, column: 4 }),
    mid = run("mid", { moved: now - 4 * 86400e3, column: 4 });
  expect(olderThan([old, mid], now, 7)).toEqual([old]);
  expect(olderThan([old, mid], now, 3)).toEqual([old, mid]);
});
test("a card's foot: project in All projects, notes, branch, git state, findings, signals", () => {
  const c = run("r", {
    tags: ["full", "claude", "yolo", "odd"],
    notes: "n",
    branch: "b",
    git: "pushed",
    open: 2,
    signal: "stale",
    land: { kind: "conflict", why: "w" },
  });
  const { chips, marks } = chipsAndMarks(c, true);
  expect(chips.map((x) => x.text)).toEqual(["p", "odd", "branch", "notes"]);
  expect(marks.map((m) => m.icon ?? m.text)).toEqual(["full", "claude", "yolo", "! Conflict", "stale", "git", "bug"]);
  expect(marks.find((m) => m.icon === "full")!.title).toBe("Full run: separate reviewer");
  expect(marks.find((m) => m.icon === "git")!.cls).toBe("ok");
  expect(chipsAndMarks(c, false).chips.map((x) => x.text)).not.toContain("p");
  const g = chipsAndMarks(run("r", { notes: "[x] Gathered from Reddit. Outside text only" }), false).chips;
  expect(g.map((x) => x.text)).toEqual(["gathered"]);
});
