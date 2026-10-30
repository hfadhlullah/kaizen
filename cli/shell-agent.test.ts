import { expect, test } from "bun:test";
import { shellAgent } from "./web.ts";
import { colorEnv } from "./pty.ts";

const procs = (m: Record<string, string>) => (path: string) => {
  if (path in m) return m[path];
  throw new Error("gone");
};

test("finds an agent below the shell, through a wrapper script", () => {
  const read = procs({ "/proc/1/task/1/children": "2 ", "/proc/2/cmdline": "/bin/bash\0/home/u/.local/bin/claude\0--x\0", "/proc/2/task/2/children": "" });
  expect(shellAgent(1, ["claude", "codex"], read)).toBe("claude");
});

test("a shell running something else, or already gone, has no agent", () => {
  const read = procs({ "/proc/1/task/1/children": "2", "/proc/2/cmdline": "vim\0claude.md\0", "/proc/2/task/2/children": "" });
  expect(shellAgent(1, ["claude"], read)).toBeUndefined();
  expect(shellAgent(9, ["claude"], read)).toBeUndefined();
});

test("board terminals drop an inherited NO_COLOR", () => {
  expect(colorEnv({ NO_COLOR: "1", PATH: "/bin" })).toEqual({ PATH: "/bin" });
});
