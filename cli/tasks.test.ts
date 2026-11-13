import { test, expect } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as t from "./tasks.ts";

const place = () => join(mkdtempSync(join(tmpdir(), "kaizen-tasks-")), ".kaizen");
const change = (state: string, task: t.Task, opId: string, fn: (task: t.Task) => void) => t.mutateTask(state, task.id, { revision: task.revision, opId }, fn);

test("duplicate titles retain distinct durable UUIDs; replayed creation and legacy adoption are stable", () => {
  const s = place();
  const a = t.createTask(s, { goal: "Workshop" }), b = t.createTask(s, { goal: "Workshop" });
  expect(a.id).not.toBe(b.id);
  expect(t.createTask(s, { goal: "Workshop" }, "send-1").id).toBe(t.createTask(s, { goal: "Workshop" }, "send-1").id);
  expect(t.adoptTask(s, "inbox:12:1", { goal: "Workshop" }).id).not.toBe(t.adoptTask(s, "inbox:12:2", { goal: "Workshop" }).id);
  expect(t.adoptTask(s, "run:2026-a", { goal: "Workshop" }).id).toBe(t.adoptTask(s, "run:2026-a", { goal: "New title" }).id);
});

test("atomic mutations reject stale tabs but replay operation ids without applying twice", () => {
  const s = place(), task = t.createTask(s, { goal: "Make workshop" });
  const next = change(s, task, "one", (x) => { x.title = "New title"; });
  expect(change(s, task, "one", () => { throw new Error("must not repeat"); }).revision).toBe(next.revision);
  expect(() => change(s, task, "two", (x) => { x.title = "Stale"; })).toThrow("another window");
  expect(t.readTask(s, task.id)?.title).toBe("New title");
  mkdirSync(join(t.taskDir(s, task.id), "mutation.lock"));
  expect(() => change(s, next, "locked", () => {})).toThrow("being updated");
});

test("draft transfer preserves goal/files and old links, and interrupted transfer is idempotent", () => {
  const board = place(), project = place();
  mkdirSync(join(board, "attachments"), { recursive: true }); writeFileSync(join(board, "attachments", "ref.txt"), "reference");
  const draft = t.createTask(board, { goal: "Event website", files: [{ name: "ref", path: "attachments/ref.txt" }] });
  const moved = t.transferDraft(board, draft.id, project, "/project");
  expect(moved.id).toBe(draft.id); expect(moved.goal).toBe(draft.goal);
  expect(readFileSync(moved.files[0]!.path, "utf8")).toBe("reference");
  expect(t.resolveTask(board, draft.id)?.state).toBe(project);
  expect(t.listTasks(board)).toHaveLength(0); expect(t.listTasks(project)).toHaveLength(1);
  expect(t.transferDraft(board, draft.id, project, "/project").id).toBe(draft.id);
  // Simulate a crash after destination commit and before the alias write.
  const retry = t.createTask(board, { goal: "Second" });
  mkdirSync(t.taskDir(project, retry.id), { recursive: true });
  writeFileSync(join(t.taskDir(project, retry.id), "task.json"), JSON.stringify({ ...retry, project: "/project", revision: retry.revision + 1 }));
  expect(t.transferDraft(board, retry.id, project, "/project").id).toBe(retry.id);
  expect(t.resolveTask(board, retry.id)?.task.project).toBe("/project");
});

test("dead process storage locks recover without authorizing ambiguous work", () => {
  const s = place(), task = t.createTask(s, { goal: "Event" }), lock = join(t.taskDir(s, task.id), "mutation.lock");
  mkdirSync(lock); writeFileSync(join(lock, "owner.json"), JSON.stringify({ pid: 2147483647 }));
  const next = change(s, task, "recover-lock", (x) => { t.beginLaunch(x); t.recoverLaunch(x); });
  expect(next.status).toBe("interrupted"); expect(next.queuePaused).toBe(true);
  expect(() => t.beginLaunch(next)).toThrow("recovery");
});

test("status questions do not dispatch production; changes wait for acknowledgement and a safe boundary", () => {
  const s = place(); let task = t.createTask(s, { goal: "Event", project: "/project" });
  task = change(s, task, "start", (x) => { const launch = t.beginLaunch(x); t.acknowledgeLaunch(x, launch.id, "run-1"); x.writePhase = true; });
  expect(() => t.beginLaunch(task)).toThrow("safe boundary");
  task = change(s, task, "question", (x) => { t.receiveInput(x, { id: "status", text: "What is happening?", intent: "status", baseResult: null }); });
  expect(task.inputs[0]?.state).toBe("applied"); expect(t.dispatchInputs(task)).toHaveLength(0);
  task = change(s, task, "change", (x) => { t.receiveInput(x, { id: "change", text: "Add map", baseResult: null }); });
  expect(task.inputs[1]?.state).toBe("queued"); expect(t.dispatchInputs(task)).toHaveLength(0);
  // A terminal becoming idle never changes safe or authorizes dispatch.
  task = change(s, task, "boundary", (x) => { t.safeBoundary(x, "run-1"); });
  expect(t.dispatchInputs(task).map((i) => i.id)).toEqual(["change"]);
  expect(t.dispatchInputs(task)).toHaveLength(0);
  expect(() => t.safeBoundary(task, "run-1")).toThrow("Acknowledge");
  t.acknowledgeInputs(task, ["change"], "applied"); t.safeBoundary(task, "run-1");
  expect(task.safe).toBe(true);
  expect(() => t.safeBoundary(task, "other-run")).toThrow("another run");
});

test("launch crash recovery never blindly replays; Stop remains stopping until confirmed", () => {
  const s = place(); const task = t.createTask(s, { goal: "Event", project: "/project" });
  t.beginLaunch(task); t.recoverLaunch(task);
  expect(task.status).toBe("interrupted"); expect(t.dispatchInputs(task)).toHaveLength(0);
  expect(() => t.beginLaunch(task)).toThrow("recovery");
  t.resumeTask(task); const launch = t.beginLaunch(task); t.acknowledgeLaunch(task, launch.id, "run-1");
  t.requestStop(task); expect(task.status).toBe("stopping"); expect(task.queuePaused).toBe(true);
  t.confirmStopped(task); expect(task.status).toBe("interrupted");
  expect(task.events.at(-1)?.text).toContain("does not undo");
  expect(() => t.confirmStopped(task)).toThrow("not requested");
});

test("stale feedback/acceptance rejected; completion means current result accepted and later feedback returns", () => {
  const task = t.createTask(place(), { goal: "Event", project: "/project" });
  task.currentResult = "result-2"; task.status = "ready";
  expect(() => t.receiveInput(task, { id: "stale", text: "Green", baseResult: "result-1" })).toThrow("result changed");
  expect(() => t.acceptTask(task, "result-1")).toThrow("no longer current");
  task.pendingDecision = { id: "q", kind: "question", text: "Which date?", run: null, iteration: 0, result: "result-2" };
  expect(() => t.acceptTask(task, "result-2")).toThrow("pending decisions");
  task.pendingDecision = null; t.acceptTask(task, "result-2");
  expect(t.taskProjection(task).filter).toBe("completed");
  t.receiveInput(task, { id: "later", text: "Add map", baseResult: "result-2" });
  expect(task.acceptedResult).toBe(null); expect(t.taskProjection(task).filter).toBe("in-progress");
  expect(() => t.acceptTask(task, "result-2")).toThrow("active work");
});

test("attention projection consistently identifies questions, results, recovery, work and acceptance", () => {
  const task = t.createTask(place(), { goal: "Event" });
  expect(t.taskProjection(task).action).toBe("Choose project");
  task.project = "/project"; task.status = "working"; expect(t.taskProjection(task).filter).toBe("in-progress");
  task.pendingDecision = { id: "p", kind: "proposal", text: "Build form", run: "r", iteration: 0, result: null };
  expect(t.taskProjection(task).label).toBe("Approve plan");
  task.pendingDecision = null; task.status = "interrupted"; expect(t.taskProjection(task).action).toBe("Review and resume");
  task.status = "ready"; task.currentResult = "v1"; expect(t.taskProjection(task).label).toBe("Your feedback needed");
});

test("a pause only lives in stopping, interrupted or failed; Resume also leaves stopping", () => {
  const s = place(), made = t.createTask(s, { goal: "x" });
  const task = change(s, made, "p", (x) => { x.status = "ready"; x.queuePaused = true; x.error = "old"; });
  expect(t.normalizePause(task)).toBe(true);
  expect(task.queuePaused).toBe(false); expect(task.error).toBeUndefined();
  expect(t.normalizePause(task)).toBe(false);
  const stopping = { ...task, status: "stopping" as const, queuePaused: true };
  expect(t.normalizePause(stopping)).toBe(false);
  t.resumeTask(stopping); expect(stopping.queuePaused).toBe(false); expect(stopping.status).toBe("draft");
});
