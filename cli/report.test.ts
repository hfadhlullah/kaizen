import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readReport, reportBlocked, reportDone, reportPhase, reportUnblock, signalOf, stateOf } from "./report.ts";

let st: string;
beforeEach(() => {
  st = mkdtempSync(join(tmpdir(), "kz-report-"));
  mkdirSync(join(st, "runs", "r1"), { recursive: true });
  writeFileSync(join(st, "runs", "r1", "state.json"), "{}");
});
afterEach(() => rmSync(st, { recursive: true, force: true }));
const now = 1e12, old = now - 11 * 60_000, build = { stage: "build", awaiting: null };

test("no report and no board terminal: no signal, so the card is as before", () => {
  expect(signalOf(build, null, undefined, now, 5)).toBeNull();
  expect(signalOf(build, null, { alive: true }, now, 5)).toBeNull();
});
test("an ended terminal with no hand-back for this stage and round is unverified, report or none", () => {
  const h = (stage: string, iteration = 0) => ({ at: old, handback: { stage, iteration, outcome: "succeeded" as const, summary: "", files: [] } });
  expect(signalOf(build, null, { alive: false }, now, 5)).toBe("unverified");
  expect(signalOf(build, { at: old }, { alive: false }, now, 5)).toBe("unverified");
  expect(signalOf(build, h("plan"), { alive: false }, now, 5)).toBe("unverified");
  expect(signalOf(build, h("build"), { alive: false }, now, 5)).toBeNull();
  expect(signalOf({ ...build, iteration: 1 }, h("build"), { alive: false }, now, 5)).toBe("unverified");
  expect(signalOf({ ...build, iteration: 1 }, h("build", 1), { alive: false }, now, 5)).toBeNull();
  expect(signalOf({ stage: "plan" }, null, { alive: false }, now, 5)).toBeNull();
  expect(signalOf({ stage: "done" }, { at: old }, { alive: false }, now, 5)).toBeNull();
});
test("stale needs a live, silent board terminal", () => {
  expect(signalOf(build, { at: old }, { alive: true, busy: true }, now, 5)).toBeNull();
  expect(signalOf(build, { at: old }, { alive: true, asking: true }, now, 5)).toBeNull();
  expect(signalOf(build, { at: old }, { alive: true, lastOut: now - 60_000 }, now, 5)).toBeNull();
  expect(signalOf(build, { at: old }, undefined, now, 5)).toBeNull();
  expect(signalOf(build, { at: old }, { alive: true, lastOut: old }, now, 5)).toBe("stale");
});
test("blocked shows until cleared, is bounded, and a hand-back clears it", () => {
  reportBlocked(st, "r1", "x".repeat(900) + "\n<b>", ["a", "b", "c", "d", "e"]);
  const r = readReport(st, "r1")!;
  expect(r.blocked!.question.length).toBe(300);
  expect(r.blocked!.options.length).toBe(4);
  expect(signalOf({ stage: "build", awaiting: "approvals.plan" }, r, undefined, now, 5)).toBe("blocked");
  reportUnblock(st, "r1");
  expect(readReport(st, "r1")!.blocked).toBeUndefined();
  reportBlocked(st, "r1", "q");
  expect(reportDone(st, "r1", "build", "maybe", "s", [])).toBeTruthy();
  expect(reportDone(st, "r1", "build", "failed", "s", ["a.ts"])).toBeNull();
  expect(readReport(st, "r1")!.blocked).toBeUndefined();
});
test("an id can't leave the state dir", () => {
  for (const id of ["../x", "a/b", "..", "nope", "/etc"]) expect(reportPhase(st, id, "x")).toBeTruthy();
  expect(existsSync(join(st, "report.json"))).toBe(false);
  expect(reportPhase(st, "r1", "building")).toBeNull();
});
test("from a worktree, reports go to the project's state dir", () => {
  expect(stateOf("/p/.kaizen/wt/r1/cli", "/p/.kaizen/wt/r1/.kaizen")).toBe("/p/.kaizen");
  expect(stateOf("/p", "/p/.kaizen")).toBe("/p/.kaizen");
});
