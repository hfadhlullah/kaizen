// Home's chat: a fake `codex` on PATH stands in for the agent, prints the JSONL that
// `codex exec --json` prints, and records the argv, working folder and stdin it was given.
import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from "node:fs";
import { join, delimiter } from "node:path";
import { tmpdir } from "node:os";
import { sendChat, readChat, listChats, deleteChat, stopChat, parseLine, takeMoves, type Event, type Board, type Upload } from "./chat.ts";

let root = "", base = "", bin = "", projA = "", projD = "", board: Board, created: string[] = [], runs: string[][] = [];
const PATH = process.env.PATH;
const posix = process.platform !== "win32";

function fake(body: string) {
  writeFileSync(join(bin, "codex"), `#!/bin/sh\nprintf '%s\\n' "$@" > "${bin}/argv"\npwd > "${bin}/cwd"\ncat > "${bin}/stdin"\n${body}\n`);
  chmodSync(join(bin, "codex"), 0o755);
}
const say = (text: string) => `cat <<'J'
{"type":"thread.started","thread_id":"T1"}
{"type":"turn.started"}
{"type":"item.started","item":{"id":"i0","type":"command_execution","command":"/usr/bin/zsh -lc ls"}}
{"type":"item.completed","item":{"id":"i0","type":"command_execution","command":"/usr/bin/zsh -lc ls","exit_code":0,"status":"completed"}}
{"type":"item.started","item":{"id":"i1","type":"agent_message"}}
{"type":"item.completed","item":{"id":"i1","type":"agent_message","text":${JSON.stringify(text)}}}
{"type":"turn.completed"}
J`;
const argv = () => readFileSync(join(bin, "argv"), "utf8").trim().split("\n");

function turn(id: string | null, text: string, project: string | null = null, uploads: Upload[] = []) {
  const events: Event[] = [];
  return new Promise<{ events: Event[]; why: string | null; id: string }>((res) => {
    const why = sendChat(base, id, text, project, board, (e) => {
      events.push(e);
      if (e.t === "done") res({ events, why: null, id: (events[0] as any).id });
    }, false, uploads);
    if (why) res({ events, why, id: "" });
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "kaizen-chat-"));
  base = join(root, "home", ".kaizen");
  projA = join(root, "A", ".kaizen");
  projD = join(root, "D", ".kaizen");
  for (const d of [base, projA, projD]) mkdirSync(d, { recursive: true });
  bin = join(root, "bin");
  mkdirSync(bin);
  process.env.PATH = bin + delimiter + PATH;
  created = [];
  runs = [];
  board = {
    agents: ["claude", "codex"],
    run: async (dir, runner, agent, text) => { runs.push([dir, runner, agent, text]); return { agent }; },
    projects: [{ dir: projA, label: "A" }, { dir: projD, label: "D" }],
    create: async (name) => {
      if (name.includes("/")) return { error: "bad name" };
      const d = join(root, name, ".kaizen");
      mkdirSync(d, { recursive: true });
      created.push(d);
      return { dir: d };
    },
  };
});
afterEach(() => { process.env.PATH = PATH; });

test.if(posix)("a message streams the reply, saves both sides, runs in the chat's project, and resumes its thread", async () => {
  fake(say("Hi."));
  const { events, why, id } = await turn(null, "say hi", projA);
  expect(why).toBeNull();
  expect(events.map((e) => e.t)).toEqual(["chat", "status", "status", "step", "status", "text", "done"]);
  expect((events[2] as any).text).toBe("Running ls");
  expect((events[3] as any).step).toEqual({ kind: "cmd", text: "ls", ok: true });
  const c = readChat(base, id)!;
  expect(c).toMatchObject({ thread: "T1", project: projA });
  expect(c.messages.map((m) => [m.role, m.text])).toEqual([["user", "say hi"], ["agent", "Hi."]]);
  expect(c.messages[1].activity).toBeUndefined();
  expect(readFileSync(join(bin, "cwd"), "utf8").trim()).toBe(join(root, "A"));
  const stdin = readFileSync(join(bin, "stdin"), "utf8");
  expect(stdin).toContain(`Project of this chat: A (${join(root, "A")})`);
  expect(stdin).toContain(`- D — ${join(root, "D")}`);
  expect(stdin.endsWith("say hi")).toBe(true);
  expect(argv()).toContain("workspace-write");
  expect(argv().slice(argv().indexOf("-m"), argv().indexOf("-m") + 4)).toEqual(["-m", "gpt-6-luna", "-c", "model_reasoning_effort=medium"]);
  expect(argv()).not.toContain("resume");
  expect(listChats(base).map((x) => [x.id, x.project])).toEqual([[id, projA]]);

  fake(say("Again."));
  await turn(id, "again");
  expect(argv().slice(argv().indexOf("-m"), argv().indexOf("-m") + 4)).toEqual(["-m", "gpt-6-luna", "-c", "model_reasoning_effort=medium"]);
  expect(argv().slice(-3)).toEqual(["resume", "T1", "-"]);
  expect(readChat(base, id)!.messages).toHaveLength(4);
});

test.if(posix)("no project: a read-only scratch folder outside every project", async () => {
  fake(say("Which project?"));
  const { id } = await turn(null, "hello");
  expect(readChat(base, id)!.project).toBeUndefined();
  expect(readFileSync(join(bin, "cwd"), "utf8").trim()).toBe(join(base, "chats", "scratch"));
  expect(argv()).toContain("workspace-write");
  expect(argv().join(" ")).toContain(`--add-dir ${join(root, "A")} --add-dir ${join(root, "D")}`);
  expect(readFileSync(join(bin, "stdin"), "utf8")).toContain("Project of this chat: none");
  // A project the page names that the board does not list is not taken.
  const r = await turn(null, "hi", join(root, "elsewhere", ".kaizen"));
  expect(readChat(base, r.id)!.project).toBeUndefined();
});

test.if(posix)("uploaded images reach Codex and other files remain readable after reload", async () => {
  fake(say("I can see both files."));
  const image = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
  const { id } = await turn(null, "", projA, [
    { name: "../reference.png", bytes: image },
    { name: "brief.txt", bytes: new TextEncoder().encode("hello") },
  ]);
  const c = readChat(base, id)!;
  expect(c.title).toBe("../reference.png");
  expect(c.messages[0].files?.map((f) => [f.name, f.image])).toEqual([["_reference.png", true], ["brief.txt", false]]);
  for (const f of c.messages[0].files!) expect(existsSync(f.path)).toBe(true);
  expect(argv()).toContain("-i");
  expect(argv()[argv().indexOf("-i") + 1]).toBe(c.messages[0].files![0].path);
  expect(readFileSync(join(bin, "stdin"), "utf8")).toContain(c.messages[0].files![1].path);
  fake(say("Again."));
  await turn(id, "check this too", null, [{ name: "more.png", bytes: image }]);
  expect(argv().slice(-5)).toEqual(["resume", "T1", "-i", readChat(base, id)!.messages[2].files![0].path, "-"]);
  expect(deleteChat(base, id)).toBeNull();
  expect(existsSync(c.messages[0].files![0].path)).toBe(false);
});

test.if(posix)("the agent switches the chat to a listed project; the move line is not shown and the next turn runs there", async () => {
  fake(say(`Switching to D.\n[[kaizen:project ${join(root, "D")}]]`));
  const { events, id } = await turn(null, "let's work on D", projA);
  expect(events.filter((e) => e.t === "text")).toEqual([{ t: "text", text: "Switching to D." }]);
  expect(events.find((e) => e.t === "project")).toEqual({ t: "project", dir: projD });
  expect(readChat(base, id)!.project).toBe(projD);
  expect(readChat(base, id)!.messages[1].steps!.at(-1)).toEqual({ kind: "project", text: "Switched to D", ok: true });
  fake(say("Here."));
  await turn(id, "go on");
  expect(readFileSync(join(bin, "cwd"), "utf8").trim()).toBe(join(root, "D"));
});

test.if(posix)("a switched chat can continue the pending request in the same reply", async () => {
  fake(say("Switching.\n[[kaizen:project D]]"));
  const { id } = await turn(null, "check the latest build in D", projA);
  fake(say("The latest build changed the shop."));
  await new Promise<void>((res) => sendChat(base, id, "Continue the pending request.", null, board, (e) => {
    if (e.t === "done") res();
  }, true));
  const c = readChat(base, id)!;
  expect(c.messages).toHaveLength(2);
  expect(c.messages[1].text).toBe("Switching.\n\nThe latest build changed the shop.");
  expect(c.messages[1].activity).toBeUndefined();
  expect(readFileSync(join(bin, "cwd"), "utf8").trim()).toBe(join(root, "D"));
});

test.if(posix)("a switch to a path the board does not list is refused and the chat stays", async () => {
  fake(say("[[kaizen:project /etc]]"));
  const { events, id } = await turn(null, "go to etc", projA);
  expect(events.some((e) => e.t === "project")).toBe(false);
  expect(readChat(base, id)!.project).toBe(projA);
  expect(readChat(base, id)!.messages[1].steps!.at(-1)).toMatchObject({ kind: "project", ok: false });
});

test.if(posix)("the agent creates a new project through the board's rules and moves there", async () => {
  fake(say("Creating it.\n[[kaizen:new-project Shop]]"));
  const { events, id } = await turn(null, "start a shop app");
  const d = join(root, "Shop", ".kaizen");
  expect(created).toEqual([d]);
  expect(events.find((e) => e.t === "project")).toEqual({ t: "project", dir: d });
  expect(readChat(base, id)!.project).toBe(d);
  fake(say("[[kaizen:new-project ../x]]"));
  const r = await turn(null, "bad");
  expect(readChat(base, r.id)!.messages[1].steps!.at(-1)).toMatchObject({ kind: "project", ok: false });
});

test("chat ids that could leave chats/ are refused before any disk access", () => {
  for (const bad of ["../x", "a/b", "..", "", "x".repeat(81)]) {
    expect(readChat(base, bad)).toBeNull();
    expect(deleteChat(base, bad)).toBe("bad chat id");
  }
  expect(existsSync(join(base, "chats"))).toBe(false);
});

test.if(posix)("too many attachments are refused before a chat is created", async () => {
  fake(say("should not run"));
  const { why } = await turn(null, "files", projA, Array.from({ length: 6 }, (_, i) => ({ name: `${i}.txt`, bytes: new Uint8Array([i]) })));
  expect(why).toMatch(/up to 5 files/);
  expect(listChats(base)).toEqual([]);
});

test.if(posix)("stop kills the agent and keeps what was said so far", async () => {
  fake(`echo '{"type":"thread.started","thread_id":"T2"}'\necho '{"type":"item.started","item":{"type":"command_execution","command":"/bin/sh -lc ls"}}'\necho '{"type":"item.completed","item":{"type":"agent_message","text":"Working"}}'\nsleep 30`);
  const events: Event[] = [];
  await new Promise<void>((res) => sendChat(base, null, "long job", projA, board, (e) => {
    events.push(e);
    if (e.t === "status") expect(readChat(base, (events[0] as any).id)!.messages[1].activity).toBe("Running ls");
    if (e.t === "text") stopChat(base, (events[0] as any).id);
    if (e.t === "done") res();
  }));
  const c = readChat(base, (events[0] as any).id)!;
  expect(c.messages[1]).toMatchObject({ role: "agent", text: "Working", error: "Stopped." });
  expect(c.messages[1].activity).toBeUndefined();
  expect(listChats(base)[0].busy).toBe(false);
});

test.if(posix)("a turn persists activity and finishes independently of the page", async () => {
  fake(`echo '{"type":"item.started","item":{"type":"command_execution","command":"/bin/sh -lc build"}}'\nsleep 0.05\necho '{"type":"item.completed","item":{"type":"agent_message","text":"Built."}}'`);
  let id = "";
  await new Promise<void>((res) => sendChat(base, null, "build", projA, board, (e) => {
    if (e.t === "chat") id = e.id;
    if (e.t === "status") expect(readChat(base, id)!.messages.at(-1)?.activity).toBe("Running build");
    if (e.t === "done") res();
  }));
  expect(readChat(base, id)!.messages.at(-1)).toMatchObject({ text: "Built." });
  expect(readChat(base, id)!.messages.at(-1)?.activity).toBeUndefined();
  expect(listChats(base)[0].busy).toBe(false);
});

test.if(posix)("a failed turn reports the agent's error", async () => {
  fake(`echo '{"type":"turn.failed","error":{"message":"model not supported"}}'; exit 1`);
  const { events } = await turn(null, "x");
  expect(events.find((e) => e.t === "error")).toEqual({ t: "error", error: "model not supported" });
});

test("no codex on PATH: a message says how to get it", async () => {
  process.env.PATH = bin;
  const { why } = await turn(null, "hi");
  expect(why).toMatch(/needs Codex/);
});

test("parseLine and takeMoves", () => {
  expect(parseLine("not json")).toBeNull();
  expect(parseLine(`{"type":"turn.started"}`)).toEqual({ t: "status", text: "Thinking…" });
  expect(parseLine(`{"type":"item.started","item":{"type":"mcp_tool_call","server":"docs","tool":"search"}}`))
    .toEqual({ t: "status", text: "Using docs search" });
  expect(parseLine(`{"type":"item.started","item":{"type":"web_search"}}`))
    .toEqual({ t: "status", text: "Searching the web…" });
  expect(parseLine(`{"type":"item.completed","item":{"type":"web_search","status":"completed"}}`))
    .toEqual({ t: "step", step: { kind: "tool", text: "Web search", ok: true } });
  expect(parseLine(`{"type":"item.completed","item":{"type":"error","message":"metadata"}}`)).toBeNull();
  expect(parseLine(JSON.stringify({ type: "item.completed", item: { type: "command_execution", command: `/bin/bash -lc "cat a.md"`, exit_code: 1 } })))
    .toEqual({ t: "step", step: { kind: "cmd", text: "cat a.md", ok: false } });
  expect(parseLine(`{"type":"item.completed","item":{"type":"file_change","changes":[{"path":"a.ts"}],"status":"completed"}}`))
    .toEqual({ t: "step", step: { kind: "edit", text: "a.ts", ok: true } });
  expect(takeMoves("ok\n\n[[kaizen:project A]]\n")).toEqual({ text: "ok", move: { op: "project", arg: "A" }, run: null });
  // Only a line of its own counts: a move quoted inside a sentence is text.
  expect(takeMoves("write `[[kaizen:project A]]` to move").move).toBeNull();
});

test.if(posix)("every listed project is writable without a switch; the chat's own folder is not repeated", async () => {
  fake(say("Read D."));
  await turn(null, "what is in D", projA);
  expect(argv().filter((a, i) => argv()[i - 1] === "--add-dir")).toEqual([join(root, "D")]);
  const stdin = readFileSync(join(bin, "stdin"), "utf8");
  expect(stdin).toContain("you do not need to switch");
  expect(stdin).toContain("installed: claude, codex");
});

test.if(posix)("a run line starts a kaizen run in the named project; the chat stays where it is", async () => {
  fake(say(`Starting it.\n[[kaizen:run ${join(root, "D")} | full | claude | add a dark mode]]`));
  const { events, id } = await turn(null, "1, full, claude", projA);
  expect(events.filter((e) => e.t === "text")).toEqual([{ t: "text", text: "Starting it." }]);
  expect(runs).toEqual([[projD, "full", "claude", "add a dark mode"]]);
  expect(events.find((e) => e.t === "run")).toEqual({ t: "run", dir: projD });
  const c = readChat(base, id)!;
  expect(c.project).toBe(projA);
  expect(c.messages[1].steps!.at(-1)).toEqual({ kind: "project", text: "Started a full run in D with claude", ok: true });
});

test.if(posix)("a run line with an unlisted project, unknown runner or missing agent is refused", async () => {
  for (const line of ["/etc | lite | claude | x", "D | auto | claude | x", "D | lite | gemini | x", "D | lite | claude | "]) {
    fake(say(`[[kaizen:run ${line}]]`));
    const { id } = await turn(null, "go", projA);
    expect(readChat(base, id)!.messages[1].steps!.at(-1)).toMatchObject({ kind: "project", ok: false });
  }
  expect(runs).toEqual([]);
});
