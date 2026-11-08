import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { approvalPrompt, boardCards, canApproveAwaiting, columnOf, readRuns, setRunState } from "./state.ts";
import { stageTimes } from "./stats.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "kz-explore-")); roots.push(root);
  const state = join(root, ".kaizen"), run = join(state, "runs", "idea");
  mkdirSync(run, { recursive: true });
  writeFileSync(join(run, "state.json"), JSON.stringify({ id: "idea", stage: "plan", awaiting: null }));
  writeFileSync(join(run, "00-request.md"), "Build a booking tool");
  return { root, state, run };
}

test("Explore persists across reads, waits for its own decision, then enters normal planning", () => {
  const { state, run } = fixture();
  expect(setRunState(state, "idea", ["stage=explore", "explore_status=active", "awaiting=explore"])).toBeNull();
  expect(readRuns(state)[0]).toMatchObject({ stage: "explore", awaiting: "explore" });
  expect(columnOf("explore", "explore")).toBe(1);
  expect(boardCards([state]).find((c) => c.id === "idea")).toMatchObject({ stage: "explore", status: "waiting" });
  expect(canApproveAwaiting("explore")).toBe(true);
  expect(setRunState(state, "idea", ["stage=plan", "explore_status=completed", "awaiting=null"])).toBeNull();
  expect(JSON.parse(readFileSync(join(run, "state.json"), "utf8"))).toMatchObject({ stage: "plan", explore_status: "completed", awaiting: null });
  expect(setRunState(state, "idea", ["awaiting=approvals.plan"])).toBeNull();
  expect(readRuns(state)[0]?.awaiting).toBe("approvals.plan");
  expect(setRunState(state, "idea", ["explore_status=maybe"])).toMatch(/explore_status/);
});

test("skipping preserves partial evidence and does not alter the saved toggle", () => {
  const { state, run } = fixture();
  writeFileSync(join(state, "config.yml"), "explore:\n  enabled: true\n");
  writeFileSync(join(run, "00-explore.md"), "Partial findings; pricing remains unknown.");
  expect(setRunState(state, "idea", ["stage=explore", "explore_status=active"])).toBeNull();
  expect(setRunState(state, "idea", ["stage=plan", "explore_status=skipped", "awaiting=null"])).toBeNull();
  expect(readFileSync(join(state, "config.yml"), "utf8")).toBe("explore:\n  enabled: true\n");
  expect(readFileSync(join(run, "00-explore.md"), "utf8")).toContain("pricing remains unknown");
});

test("Explore confirmation asks for a plan, while a revise continues exploration", () => {
  const approve = approvalPrompt("idea", "explore");
  expect(approve).toContain("00-explore.md");
  expect(approve).toContain("01-plan.md");
  expect(approve).toContain("keep the normal plan approval before building");
  expect(approve).not.toContain("commit and push");
  const revise = approvalPrompt("idea", "explore", "Research local alternatives first");
  expect(revise).toContain("Research local alternatives first");
  expect(revise).toContain("do not begin building");
});

test("Explore time stays separate from planning and confirmation wait", () => {
  const log = ["2026-11-08T10:00:00Z explore -", "2026-11-08T10:10:00Z explore explore", "2026-11-08T10:15:00Z plan -", "2026-11-08T10:20:00Z build -"].join("\n");
  expect(stageTimes(log, Date.parse("2026-11-08T10:00:00Z"))).toMatchObject({ explore: 600000, wait: 300000, plan: 300000 });
});
