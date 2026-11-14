import { expect, test } from "bun:test";
import { applyEvent, fits, lines, projectName, readLine, runsIn, type Chat, type Msg } from "./lib/home.ts";

test("run ids the agent names are offered only when they are cards on this board", () => {
  const text = "Started 2026-11-14-fix-login and 2026-11-14-fix-login again, not 2026-01-01-other.";
  expect(runsIn(text, ["2026-11-14-fix-login"])).toEqual(["2026-11-14-fix-login"]);
  expect(runsIn("nothing here", ["x"])).toEqual([]);
});

test("a project is named by its folder, or by its label's folder", () => {
  expect(projectName("/a/b/proj/.kaizen", [])).toBe("proj");
  expect(projectName("/a/b/proj/.kaizen", [{ dir: "/a/b/proj/.kaizen", label: "/x/Pretty name" }])).toBe("Pretty name");
});

test("files: 5 at most, 10 MB each, 20 MB together", () => {
  const f = (mb: number) => ({ size: mb * 1024 * 1024 }) as File;
  expect(fits([], f(10))).toBe(true);
  expect(fits([], f(11))).toBe(false);
  expect(fits([f(10), f(9)], f(2))).toBe(false);
  expect(fits(Array(5).fill(f(1)), f(1))).toBe(false);
});

test("a streamed body is split into lines however it was cut; a bad line is skipped", () => {
  const feed = lines();
  expect(feed('{"t":"te')).toEqual([]);
  expect(feed('xt","text":"hi"}\n{"t":"status"')).toEqual(['{"t":"text","text":"hi"}']);
  expect(feed(',"text":"x"}\n')).toEqual(['{"t":"status","text":"x"}']);
  expect(readLine("not json")).toBe(null);
});

test("events build the reply: text paragraphs, steps, status, error, and a project move", () => {
  const cur: Chat = { id: null, title: "t", project: null, messages: [] };
  const reply: Msg = { role: "agent", text: "", steps: [], activity: "Thinking…" };
  expect(applyEvent(cur, reply, { t: "chat", id: "c1" })).toEqual({ id: "c1" });
  expect(cur.id).toBe("c1");
  applyEvent(cur, reply, { t: "text", text: "one" });
  applyEvent(cur, reply, { t: "text", text: "two" });
  expect(reply.text).toBe("one\n\ntwo");
  applyEvent(cur, reply, { t: "status", text: "Running tests" });
  expect(reply.activity).toBe("Running tests");
  applyEvent(cur, reply, { t: "step", step: { text: "ls" } });
  expect([reply.steps!.length, reply.activity]).toEqual([1, "Thinking…"]);
  applyEvent(cur, reply, { t: "error", error: "boom" });
  expect(reply.error).toBe("boom");
  expect(applyEvent(cur, reply, { t: "project", dir: "/p" })).toEqual({ project: "/p" });
  expect(cur.project).toBe("/p");
});
