import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, utimesSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { summarize, record, readActivity, activityFile, kaizenDirOf, activityMtime } from "./activity.ts";

// Payloads captured from a real `claude -p` run (PreToolUse / PostToolUse), trimmed.
const cwd = "/p/proj";
const pre = (tool_name: string, tool_input: object) => ({ hook_event_name: "PreToolUse", tool_name, tool_input, cwd, session_id: "s-1" });

test("a tool call becomes one plain line", () => {
  expect(summarize(pre("Read", { file_path: "/p/proj/cli/web.ts" }))?.text).toBe("Reading cli/web.ts");
  expect(summarize(pre("Edit", { file_path: "/p/proj/a/b.ts" }))?.text).toBe("Editing a/b.ts");
  expect(summarize(pre("Write", { file_path: "/elsewhere/x.md" }))?.text).toBe("Writing /elsewhere/x.md");
  expect(summarize(pre("Bash", { command: "echo hi > b.txt && cat b.txt", description: "Write hi to b.txt and verify contents" }))?.text).toBe("Running: Write hi to b.txt and verify contents");
  expect(summarize(pre("Bash", { command: "bun test" }))?.text).toBe("Running: bun test");
  expect(summarize(pre("Grep", { pattern: "foo" }))?.text).toBe("Searching: foo");
  expect(summarize(pre("Agent", { description: "review it" }))?.text).toBe("Delegating: review it");
  expect(summarize(pre("Mystery", {}))?.text).toBe("Mystery");
  expect(summarize({})).toBeNull();
});
test("a command's secrets are not shown", () => {
  const t = summarize(pre("Bash", { command: "curl -H 'Authorization: Bearer abc123' x; API_TOKEN=s3cret node a.js" }))!.text;
  expect(t).not.toContain("abc123");
  expect(t).not.toContain("s3cret");
});
test("after a command only a finished test run is reported", () => {
  const post = (stdout: string, tool_name = "Bash") => ({ hook_event_name: "PostToolUse", tool_name, tool_input: {}, tool_response: { stdout }, cwd });
  expect(summarize(post(" 1173 pass\n 0 fail\nRan 1173"))?.text).toBe("Tests: 1173 pass, 0 fail");
  expect(summarize(post("hi"))).toBeNull();
  expect(summarize(post(" 3 pass\n 1 fail", "Read"))).toBeNull();
});

test("record writes under the project's .kaizen, trims, and ignores a folder with no runs", () => {
  const root = mkdtempSync(join(tmpdir(), "act-"));
  mkdirSync(join(root, ".kaizen", "runs"), { recursive: true });
  mkdirSync(join(root, "sub"));
  const p = (n: number) => ({ ...pre("Read", { file_path: join(root, "sub", `f${n}.ts`) }), cwd: join(root, "sub") });
  expect(kaizenDirOf(join(root, "sub"))).toBe(join(root, ".kaizen"));
  record(p(1), 1000);
  record(p(2), 2000);
  const a = readActivity(join(root, ".kaizen"), "s-1");
  expect(a.map((x) => x.text)).toEqual(["Reading f1.ts", "Reading f2.ts"]);
  expect(activityMtime(join(root, ".kaizen"), "s-1")).toBeGreaterThan(0);
  // no runs folder anywhere above: nothing written
  const other = mkdtempSync(join(tmpdir(), "act-"));
  record({ ...pre("Read", { file_path: "x" }), cwd: other });
  expect(existsSync(join(other, ".kaizen"))).toBe(false);
  // trims past the cap
  for (let i = 0; i < 1500; i++) record(p(i), 3000 + i);
  const lines = readFileSync(activityFile(join(root, ".kaizen"), "s-1"), "utf8").trim().split("\n");
  expect(lines.length).toBeLessThan(1000);
  expect(JSON.parse(lines.at(-1)!).text).toContain("f1499");
});
test("an old session's file is cleared when a new one starts", () => {
  const root = mkdtempSync(join(tmpdir(), "act-"));
  mkdirSync(join(root, ".kaizen", "runs"), { recursive: true });
  const kz = join(root, ".kaizen");
  record({ ...pre("Read", { file_path: "a" }), cwd: root, session_id: "old" }, 1);
  const old = activityFile(kz, "old");
  utimesSync(old, 1, 1);
  record({ ...pre("Read", { file_path: "a" }), cwd: root, session_id: "new" }, Date.now());
  expect(existsSync(old)).toBe(false);
});
test("the script exits 0 on garbage and writes nothing", async () => {
  const proc = Bun.spawn(["bun", join(import.meta.dir, "activity.ts")], { stdin: new Blob(["not json"]), stdout: "pipe", stderr: "pipe" });
  expect(await proc.exited).toBe(0);
  expect(await new Response(proc.stdout).text()).toBe("");
});

import { runSettingsFlags, runHooksFile, bypassFlags } from "./state.ts";
test("a Claude run launch carries one --settings with the hooks, and Yolo keeps its flag and the warning acceptance", () => {
  const home = mkdtempSync(join(tmpdir(), "home-"));
  const plain = runSettingsFlags("claude", false, home);
  expect(plain[0]).toBe("--settings");
  const cfg = JSON.parse(readFileSync(plain[1]!, "utf8"));
  expect(cfg.hooks.PreToolUse[0].hooks[0].command).toContain("activity.ts");
  expect(cfg.hooks.PostToolUse[0].matcher).toBe("Bash");
  expect(cfg.skipDangerousModePermissionPrompt).toBeUndefined();
  const yolo = runSettingsFlags("claude", true, home);
  expect(yolo.filter((x) => x === "--settings").length).toBe(1);
  expect(yolo).toContain(bypassFlags("claude").find((x) => x.startsWith("--dangerously")) ?? "--dangerously-skip-permissions");
  const y = JSON.parse(readFileSync(yolo[yolo.indexOf("--settings") + 1]!, "utf8"));
  expect(y.skipDangerousModePermissionPrompt).toBe(true);
  expect(y.hooks.PreToolUse).toBeDefined();
  // other agents get no hooks; Yolo for them is unchanged
  expect(runSettingsFlags("codex", false, home)).toEqual([]);
  expect(runSettingsFlags("codex", true, home)).toEqual(bypassFlags("codex"));
  // unchanged text is not rewritten
  expect(runHooksFile(false, home)).toBe(plain[1]!);
});
