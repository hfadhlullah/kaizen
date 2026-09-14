// State module against a throwaway .kaizen/. Nothing here spawns a terminal: the
// launch path is covered only up to the command it would run.
import { test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readRuns, readInbox, writeInbox, replaceIdea, abandonRun, allBacklog, backlog,
  statusOf, columnOf, parseItem, startedRuns, boardCards, readArchive, setArchived,
} from "./state.ts";

let state: string;
const run = (id: string, s: object, request = "") => {
  const dir = join(state, "runs", id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "state.json"), JSON.stringify(s));
  if (request) writeFileSync(join(dir, "00-request.md"), request);
  return dir;
};

beforeAll(() => {
  state = join(mkdtempSync(join(tmpdir(), "kaizen-")), ".kaizen");
  mkdirSync(state, { recursive: true });
  run("2026-09-01-waiting", { stage: "plan", awaiting: "approvals.plan" }, "# Request\n\nAdd OAuth login\n");
  run("2026-09-02-done", { stage: "done", awaiting: null }, "# Request\n\nRename cli flags\n");
  const old = run("2026-09-03-stale", { stage: "build", awaiting: null });
  const then = new Date(Date.now() - 2 * 3600_000);
  utimesSync(join(old, "state.json"), then, then);
  writeFileSync(join(state, "runs", "2026-09-02-done", "06-backlog.md"),
    "# Backlog\n\n- open: `cli/x.ts:12`: low: first thing. Fix: do it.\n- done: closed one | run y\n- open: plain item\n");
  writeFileSync(join(state, "backlog.md"), "- open: orphaned item\n");
  writeInbox(state, [
    { status: "open", text: "add oauth login" },
    { status: "open", text: "retry failed webhooks" },
    { status: "started", text: "nightly digest" },
    { status: "rejected", text: "gantt view | not this product" },
  ]);
});
afterAll(() => rmSync(join(state, ".."), { recursive: true, force: true }));

test("readRuns: newest first, mtime as moved", () => {
  const runs = readRuns(state);
  expect(runs.map((r) => r.id)).toEqual(["2026-09-03-stale", "2026-09-02-done", "2026-09-01-waiting"]);
  expect(runs[2]!.awaiting).toBe("approvals.plan");
  expect(runs[0]!.moved).toBeLessThan(Date.now() - 3600_000);
});

test("statusOf: waiting beats stage, mtime decides running vs stalled", () => {
  const now = Date.now();
  const [stale, done, waiting] = readRuns(state);
  expect(statusOf(waiting!, now)).toBe("waiting");
  expect(statusOf(done!, now)).toBe("done");
  expect(statusOf(stale!, now)).toBe("stalled");
  expect(statusOf({ ...stale!, moved: now }, now)).toBe("running");
  expect(statusOf({ ...stale!, stage: "abandoned", awaiting: "x" }, now)).toBe("abandoned");
});

test("columnOf: every stage word lands somewhere", () => {
  expect(["plan", "build", "review", "done", "abandoned", "weird"].map(columnOf)).toEqual([1, 2, 3, 4, 4, 1]);
});

test("inbox round-trips and ignores malformed lines", () => {
  writeFileSync(join(state, "inbox.md"), readFileSync(join(state, "inbox.md"), "utf8") + "not an item\n");
  expect(readInbox(state).map((l) => l.status)).toEqual(["open", "open", "started", "rejected"]);
});

test("boardCards: idea retired once a run's request contains it; started idea sits in planning", () => {
  const cards = boardCards([state], Date.now());
  const ideas = cards.filter((k) => k.kind === "idea").map((k) => [k.text, k.column, k.status]);
  expect(ideas).toEqual([["retry failed webhooks", 0, "idea"], ["nightly digest", 1, "starting"]]);
  const runs = cards.filter((k) => k.kind === "run").map((k) => [k.id, k.column, k.status]);
  expect(runs).toEqual([["2026-09-03-stale", 2, "stalled"], ["2026-09-02-done", 4, "done"], ["2026-09-01-waiting", 1, "waiting"]]);
});

test("replaceIdea edits, rejects, deletes by text", () => {
  replaceIdea(state, "retry failed webhooks", { status: "open", text: "retry failed webhooks twice" });
  expect(readInbox(state).some((l) => l.text === "retry failed webhooks twice")).toBe(true);
  replaceIdea(state, "retry failed webhooks twice", { status: "rejected", text: "retry failed webhooks twice | no" });
  replaceIdea(state, "nightly digest", null);
  expect(readInbox(state).map((l) => l.status)).toEqual(["open", "rejected", "rejected"]);
});

test("abandonRun: flips stage, clears awaiting, records the reason, refuses twice", () => {
  expect(abandonRun(state, "2026-09-01-waiting", "changed my mind")).toBeNull();
  const s = JSON.parse(readFileSync(join(state, "runs", "2026-09-01-waiting", "state.json"), "utf8"));
  expect([s.stage, s.awaiting]).toEqual(["abandoned", null]);
  expect(readFileSync(join(state, "runs", "2026-09-01-waiting", "02-approval.md"), "utf8")).toContain("changed my mind");
  expect(abandonRun(state, "2026-09-01-waiting", "again")).toMatch(/already/);
});

test("backlog: open items only, orphanage last, count matches", () => {
  const groups = allBacklog(state);
  expect(groups.map((g) => g.run)).toEqual(["2026-09-02-done", "Orphaned"]);
  expect(groups[0]!.items.length).toBe(2);
  expect(backlog(state)).toBe(3);
});

test("parseItem: finding line splits into where, severity, text", () => {
  const it = parseItem("`cli/x.ts:12`: low: first thing. Fix: do it.");
  expect([it.where, it.severity, it.text]).toEqual(["x.ts:12", "low", "first thing."]);
  expect(parseItem("plain item").severity).toBeNull();
});

test("startedRuns: normalised request bodies", () => {
  expect(startedRuns(state).sort()).toEqual(["# request add oauth login", "# request rename cli flags"]);
});

test("archive: a run is listed, hidden by flag, never moved", () => {
  setArchived(state, "2026-09-02-done", true);
  expect([...readArchive(state)]).toEqual(["2026-09-02-done"]);
  const card = boardCards([state], Date.now()).find((k) => k.id === "2026-09-02-done")!;
  expect([card.archived, card.column]).toEqual([true, 4]);
  setArchived(state, "2026-09-02-done", false);
  expect(readArchive(state).size).toBe(0);
  expect(boardCards([state], Date.now()).find((k) => k.id === "2026-09-02-done")!.archived).toBe(false);
});

test("archive: an idea keeps its line with status archived", () => {
  writeInbox(state, [{ status: "open", text: "park this" }, { status: "archived", text: "parked zq7" }]);
  const ideas = boardCards([state], Date.now()).filter((k) => k.kind === "idea");
  expect(ideas.map((k) => [k.text, k.archived])).toEqual([["park this", false], ["parked zq7", true]]);
});
