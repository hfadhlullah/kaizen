import { test, expect, beforeEach } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { move, awaitBoard, childDied, childQuiet, QUIET_MS, finish, markWoken, requestOpen, readHandoff, request, REQUEST_MS, started, wakeAction, wakeLine, type Handoff } from "./handoff.ts";
import { agentLine } from "./workers.ts";

const ID = "2026-11-01-x";
let state: string;
beforeEach(() => {
  state = mkdtempSync(join(tmpdir(), "hand-"));
  mkdirSync(join(state, "runs", ID), { recursive: true });
  writeFileSync(join(state, "runs", ID, "state.json"), "{}");
});
const idle = { alive: true, busy: false, asking: false, typedAt: 0 };
const ended = (o: Partial<Handoff> = {}): Handoff => ({ status: "done", parent_terminal: "sh-1", at: 0, ...o });

test("G-04 outside a board terminal nothing is requested", () => {
  expect(request(state, ID, undefined)).toBeNull();
  expect(readHandoff(state, ID)).toBeNull();
});

test("G-04 no answer declines, so a late board opens nothing", async () => {
  request(state, ID, "sh-1");
  expect(await awaitBoard(state, ID, 30, 5)).toBe(false);
  const h = readHandoff(state, ID)!;
  expect(h.status).toBe("declined");
  expect(requestOpen(h, h.at)).toBe(false);
});

test("G-04 an old request is not acted on", () => {
  expect(requestOpen(ended({ status: "requested", at: 0 }), REQUEST_MS + 1)).toBe(false);
});

test("the board's answer ends the wait", async () => {
  request(state, ID, "sh-1"); started(state, ID, "sh-2");
  expect(await awaitBoard(state, ID, 30, 5)).toBe(true);
  expect(readHandoff(state, ID)!.child_terminal).toBe("sh-2");
});

test("only a running handoff takes a result", () => {
  expect(finish(state, ID, "done")).toContain("no handoff");
  request(state, ID, "sh-1");
  expect(finish(state, ID, "done")).toContain("requested");
  started(state, ID, "sh-2");
  expect(finish(state, ID, "blocked", "why")).toBeNull();
  expect(finish(state, ID, "done")).not.toBeNull();
  expect(readHandoff(state, ID)).toMatchObject({ status: "blocked", reason: "why" });
});

test("G-05 a wake is held while busy, asking or typing, then sent once", () => {
  expect(wakeAction(ended(), { ...idle, busy: true }, 1e6)).toBe("wait");
  expect(wakeAction(ended(), { ...idle, asking: true }, 1e6)).toBe("wait");
  expect(wakeAction(ended(), { ...idle, typedAt: 1e6 - 1000 }, 1e6)).toBe("wait");
  expect(wakeAction(ended(), idle, 1e6)).toBe("send");
  expect(wakeAction(ended({ woken: true }), idle, 1e6)).toBe("none");
  expect(wakeAction(ended({ status: "running" }), idle, 1e6)).toBe("none");
  request(state, ID, "sh-1"); started(state, ID, "sh-2"); finish(state, ID, "done"); markWoken(state, ID);
  expect(wakeAction(readHandoff(state, ID), idle, 1e6)).toBe("none");
});

test("G-06 a dead child fails, and a dead parent is reported, not typed at", () => {
  expect(childDied(ended({ status: "running" }), false)).toBe(true);
  expect(childDied(ended({ status: "running" }), true)).toBe(false);
  expect(childDied(ended(), false)).toBe(false);
  expect(wakeAction(ended({ status: "failed" }), idle, 1e6)).toBe("send");
  expect(wakeAction(ended(), null, 1e6)).toBe("gone");
});

test("G-04 a second agent that already finished is not mistaken for no board", async () => {
  request(state, ID, "sh-1"); started(state, ID, "sh-2"); finish(state, ID, "done");
  expect(await awaitBoard(state, ID, 30, 5)).toBe(true);
});

test("G-05 the wake line reaches a real terminal, submitted", async () => {
  const { startPty, submitPty, ptyTail } = await import("./pty.ts");
  if (process.platform === "win32") return;
  startPty("hand-wake", ["sh", "-c", "timeout 1 cat"], state);
  submitPty("hand-wake", wakeLine(ID, ended()), 20);
  await Bun.sleep(200);
  expect(ptyTail("hand-wake")).toContain(`kaizen run ${ID}: the worktree agent ended (done)`);
});

test("G-07 the second agent never takes bypass", () => {
  const project = join(state, "p");
  mkdirSync(join(project, ".kaizen", "runs", ID), { recursive: true });
  writeFileSync(join(project, ".kaizen", "runs", ID, "state.json"), JSON.stringify({ agent: "claude" }));
  const l = agentLine(project, ID, "hi", "own");
  if (typeof l !== "string") { expect(l.bypass).toBe(false); expect(l.argv.join(" ")).not.toContain("dangerously"); }
});

test("a silent child goes quiet, wakes the parent, and can still report", () => {
  const pty = { alive: true, busy: false, asking: false, lastOut: 0 };
  expect(childQuiet(ended({ status: "running" }), pty, QUIET_MS + 1)).toBe(true);
  expect(childQuiet(ended({ status: "running" }), { ...pty, asking: true }, QUIET_MS + 1)).toBe(false);
  expect(childQuiet(ended({ status: "running" }), pty, QUIET_MS - 1)).toBe(false);
  expect(wakeAction(ended({ status: "quiet" }), idle, 1e6)).toBe("send");
  request(state, ID, "sh-1"); started(state, ID, "sh-2");
  move(state, ID, ["running"], { status: "quiet", woken: true });
  expect(finish(state, ID, "done")).toBeNull();
  expect(wakeAction(readHandoff(state, ID), idle, 1e6)).toBe("send");
});

test("cold 1: a second start never replaces a live agent", () => {
  request(state, ID, "sh-1"); started(state, ID, "sh-2");
  expect(request(state, ID, "sh-9")).toMatchObject({ status: "running", child_terminal: "sh-2" });
  finish(state, ID, "blocked", "x");
  expect(request(state, ID, "sh-9")).toMatchObject({ status: "requested", parent_terminal: "sh-9" });
});

test("cold 2: claim and decline cannot both win", async () => {
  request(state, ID, "sh-1");
  const claim = setTimeout(() => started(state, ID, "sh-2"), 5);
  await Bun.sleep(10); clearTimeout(claim);
  expect(await awaitBoard(state, ID, 0)).toBe(true);
  writeFileSync(join(state, "runs", ID, "handoff.json"), JSON.stringify({ status: "declined", parent_terminal: "sh-1", at: 0 }));
  expect(started(state, ID, "sh-3")).toBe(false);
});

test("cold 3: a stale board read cannot overwrite done", () => {
  request(state, ID, "sh-1"); started(state, ID, "sh-2"); finish(state, ID, "done");
  expect(move(state, ID, ["running", "quiet"], { status: "failed" })).toBe(false);
  expect(readHandoff(state, ID)!.status).toBe("done");
});

test("cold 5: a quiet child that dies counts as dead", () => {
  expect(childDied(ended({ status: "quiet" }), false)).toBe(true);
});

test("cold 7: a draft holds the wake", () => {
  expect(wakeAction(ended(), { ...idle, draft: true, typedAt: 1e6 - 6000 }, 1e6)).toBe("held");
  expect(wakeAction(ended(), { ...idle, draft: true, typedAt: 1e9 - 11 * 60_000 }, 1e9)).toBe("send");
});
