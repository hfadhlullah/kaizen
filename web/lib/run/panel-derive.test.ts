import { expect, test } from "bun:test";
import { defaultTab, deriveRun, readable, stepsHead, taskPanel, titleOf, type RunIn } from "./panel-derive.ts";

const run = (o: any = {}) => ({ kind: "run", id: "r1", state: "/s", where: "/p/proj", column: 3, status: "waiting", awaiting: "approvals.review", ...o });
const input = (o: Partial<RunIn> = {}): RunIn => ({
  card: run(),
  runDoc: { id: "r1", request: "ask", plan: "p", review: "rv", findings: [{ n: 1, text: "fix the thing" }], state: "{}" },
  wantTab: "review",
  view: "board",
  wide: true,
  git: { shown: false, pending: false },
  hit: null,
  refresh: false,
  key: (c) => c.id,
  ...o,
});

test("titles read a run's slug as words, and a task by its first line", () => {
  expect(readable("2026-10-18-board-ui-revision")).toBe("Board UI revision");
  expect(readable("Already words")).toBe("Already words");
  expect(titleOf({ kind: "run", title: "2026-10-18-fix-cli" })).toBe("Fix CLI");
});
test("a card opens on its column's tab", () => {
  expect(defaultTab(run({ column: 1 }))).toBe("plan");
  expect(defaultTab(run({ column: 3 }))).toBe("review");
  expect(defaultTab(run({ stage: "explore" }))).toBe("explore");
  expect(defaultTab(run({ status: "abandoned" }))).toBe("plan");
  expect(defaultTab(run({ column: 9 }))).toBe("request");
});
test("only tabs with something in them show; a tab not written yet falls back to the latest that is", () => {
  const d = deriveRun(input({ wantTab: "explore" }));
  expect(d.tabs.map((t) => t.k)).toEqual(["request", "notes", "plan", "review"]);
  expect(d.tab).toBe("review");
  expect(deriveRun(input({ wantTab: "plan" })).tab).toBe("plan");
});
test("the run workspace never shows Preview as a panel tab", () => {
  const rd = { id: "r1", request: "a", review: "r", impl: "## Preview\nhttp://localhost:3000\n" };
  expect(deriveRun(input({ runDoc: rd, wantTab: "preview", view: "run" })).tab).not.toBe("preview");
  expect(deriveRun(input({ runDoc: rd, wantTab: "preview", view: "board" })).tabs.map((t) => t.k)).toContain("preview");
});
test("the header: chips for an abandoned run, meta in the workspace or a wide window, steps on a narrow board", () => {
  expect(deriveRun(input({ card: run({ status: "abandoned" }) })).head.kind).toBe("chips");
  expect(deriveRun(input()).head.kind).toBe("meta");
  expect(deriveRun(input({ wide: false })).head.kind).toBe("steps");
  const h = stepsHead(run({ column: 3 }), null) as any;
  expect(h.phases.names).toEqual(["Plan", "Build", "Review", "Done"]);
  expect(h.phases.at).toBe(2);
  expect((stepsHead(run({ stage: "explore" }), null) as any).phases.names[0]).toBe("Explore");
});
test("the Fix form shows on a review waiting on findings, not on an archived or healed run or one with none open", () => {
  expect(deriveRun(input()).fix?.findings.length).toBe(1);
  expect(deriveRun(input({ card: run({ healed: true }) })).fix).toBeNull();
  expect(deriveRun(input({ card: run({ archived: true }) })).fix).toBeNull();
  expect(deriveRun(input({ card: run({ status: "running", awaiting: null }) })).fix).toBeNull();
  expect(deriveRun(input({ wantTab: "plan" })).fix).toBeNull();
});
test("a link's item is found by its text and marked only on the draw an open asked for", () => {
  const hit = { type: "finding", n: 1, k: "r1" };
  expect(deriveRun(input({ hit })).doc?.needle).toBe("fix the thing");
  expect(deriveRun(input({ hit, refresh: true })).doc?.needle).toBeNull();
  expect(deriveRun(input({ hit: { ...hit, n: 9 } })).needle).toBeNull();
  expect(deriveRun(input({ hit: { ...hit, k: "other" } })).doc?.needle).toBeNull();
});
test("the footer points at Source control only off that tab", () => {
  const git = { shown: true, pending: true };
  expect(deriveRun(input({ git, wantTab: "review" })).footer.sourceControl).toBe(true);
  expect(deriveRun(input({ git, wantTab: "git" })).footer.sourceControl).toBe(false);
  expect(deriveRun(input({ git, wantTab: "git" })).kind).toBe("git");
});
test("a notes tab is read-only for a finished, abandoned or archived run", () => {
  expect(deriveRun(input({ wantTab: "notes" })).notes?.ro).toBe(false);
  expect(deriveRun(input({ wantTab: "notes", card: run({ status: "done" }) })).notes?.ro).toBe(true);
});
test("a task's header is its folder, or the steps while it starts", () => {
  expect((taskPanel({ kind: "idea", where: "/p/proj", status: "idea" } as any).head as any).where).toBe("proj");
  expect(taskPanel({ kind: "idea", where: "/p/proj", status: "starting" } as any).head.kind).toBe("steps");
});
