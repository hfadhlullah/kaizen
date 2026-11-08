import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseHistory, shellHistory } from "./term-history.ts";

test("parses bash timestamps, extended zsh and fish escapes", () => {
  expect(parseHistory("#1700000000\npwd\nls -la\n", "bash")).toEqual(["pwd", "ls -la"]);
  expect(parseHistory(": 1700000000:0;echo hello\\\nworld\npwd\n", "zsh")).toEqual(["echo hello\nworld", "pwd"]);
  expect(parseHistory("- cmd: echo one\\ntwo\\\\three\n  when: 123\n", "fish")).toEqual(["echo one\ntwo\\three"]);
});

test("merges saved shells, prefers selected shell, honors HISTFILE and deduplicates", async () => {
  const root = await mkdtemp(join(tmpdir(), "term-history-"));
  try {
    await writeFile(join(root, ".bash_history"), "pwd\nbash-only\n");
    await writeFile(join(root, ".zsh_history"), ": 123:0;pwd\n: 124:0;zsh-only\n");
    await mkdir(join(root, "custom"));
    await writeFile(join(root, "custom", "history"), "custom-command\n");
    expect(await shellHistory({ SHELL: "/bin/zsh", HISTFILE: "~/custom/history" }, root)).toEqual(["custom-command", "zsh-only", "pwd", "bash-only"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("missing history is empty and large files are capped to newest 500 distinct commands", async () => {
  const root = await mkdtemp(join(tmpdir(), "term-history-"));
  try {
    expect(await shellHistory({}, root)).toEqual([]);
    await writeFile(join(root, ".bash_history"), Array.from({ length: 1000 }, (_, i) => `echo ${i} ${"x".repeat(600)}`).join("\n"));
    const result = await shellHistory({}, root);
    expect(result).toHaveLength(500);
    expect(result[0].startsWith("echo 999 ")).toBe(true);
    expect(result[499].startsWith("echo 500 ")).toBe(true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
