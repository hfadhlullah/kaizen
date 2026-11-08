import { expect, test } from "bun:test";
import { terminalSessions } from "./term-sessions.ts";

test("global terminals include every project's stage sessions and shells once", () => {
  const a = { key: "a-review", all: ["a-build", "a-review"], alive: false, asking: true };
  const sessions = terminalSessions([
    { id: "a", where: "project-a", pty: a },
    { id: "b", where: "project-b", pty: { key: "b", alive: true } },
    { id: "old", archived: true, pty: { key: "old" } },
  ], [{ key: "shell", dir: "/project-c/.kaizen", title: "Shell" }]);
  expect([...sessions.keys()]).toEqual(["a-build", "a-review", "b", "shell"]);
  expect(sessions.get("a-build").pty).toEqual({ key: "a-build", alive: true, asking: false });
  expect(sessions.get("a-review").pty).toBe(a);
  expect(sessions.get("shell").where).toBe("/project-c");
});

test("newest card owns a shared session, with no duplicate tile", () => {
  const pty = { key: "shared", all: ["shared"], alive: true };
  const sessions = terminalSessions([{ id: "old", pty }, { id: "new", pty }], []);
  expect(sessions.size).toBe(1);
  expect(sessions.get("shared").id).toBe("new");
});
