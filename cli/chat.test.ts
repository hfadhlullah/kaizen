// Home's chat: a fake `codex` on PATH stands in for the agent, prints the JSONL that
// `codex exec --json` prints, and records the argv, working folder and stdin it was given.
import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from "node:fs";
import { join, delimiter } from "node:path";
import { tmpdir } from "node:os";
import { sendChat, readChat, listChats, deleteChat, stopChat, parseLine, takeMoves, type Event, type Board } from "./chat.ts";

let root = "", base = "", bin = "", projA = "", projD = "", board: Board, created: string[] = [];
const PATH = process.env.PATH;
const posix = process.platform !== "win32";

function fake(body: string) {
  writeFileSync(join(bin, "codex"), `#!/bin/sh\nprintf '%s\\n' "$@" > "${bin}/argv"\npwd > "${bin}/cwd"\ncat > "${bin}/stdin"\n${body}\n`);
  chmodSync(join(bin, "codex"), 0o755);
}
const say = (text: string) => `cat <<'J'
{"type":"thread.started","thread_id":"T1"}
{"type":"item.completed","item":{"id":"i0","type":"command_execution","command":"/usr/bin/zsh -lc ls","exit_code":0,"status":"completed"}}
{"type":"item.completed","item":{"id":"i1","type":"agent_message","text":${JSON.stringify(text)}}}
{"type":"turn.completed"}
J`;
const argv = () => readFileSync(join(bin, "argv"), "utf8").trim().split("\n");

function turn(id: string | null, text: string, project: string | null = null) {
  const events: Event[] = [];
  return new Promise<{ events: Event[]; why: string | null; id: string }>((res) => {
    const why = sendChat(base, id, text, project, board, (e) => {
      events.push(e);
      if (e.t === "done") res({ events, why: null, id: (events[0] as any).id });
    });
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
  board = {
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
  expect(events.map((e) => e.t)).toEqual(["chat", "step", "text", "done"]);
  expect((events[1] as any).step).toEqual({ kind: "cmd", text: "ls", ok: true });
  const c = readChat(base, id)!;
  expect(c).toMatchObject({ thread: "T1", project: projA });
  expect(c.messages.map((m) => [m.role, m.text])).toEqual([["user", "say hi"], ["agent", "Hi."]]);
  expect(readFileSync(join(bin, "cwd"), "utf8").trim()).toBe(join(root, "A"));
  const stdin = readFileSync(join(bin, "stdin"), "utf8");
  expect(stdin).toContain(`Project of this chat: A (${join(root, "A")})`);
  expect(stdin).toContain(`- D — ${join(root, "D")}`);
  expect(stdin.endsWith("say hi")).toBe(true);
  expect(argv()).toContain("workspace-write");
  expect(argv()).not.toContain("resume");
  expect(listChats(base).map((x) => [x.id, x.project])).toEqual([[id, projA]]);

  fake(say("Again."));
  await turn(id, "again");
  expect(argv().slice(-3)).toEqual(["resume", "T1", "-"]);
  expect(readChat(base, id)!.messages).toHaveLength(4);
});

test.if(posix)("no project: a read-only scratch folder outside every project", async () => {
  fake(say("Which project?"));
  const { id } = await turn(null, "hello");
  expect(readChat(base, id)!.project).toBeUndefined();
  expect(readFileSync(join(bin, "cwd"), "utf8").trim()).toBe(join(base, "chats", "scratch"));
  expect(argv()).toContain("read-only");
  expect(readFileSync(join(bin, "stdin"), "utf8")).toContain("Project of this chat: none");
  // A project the page names that the board does not list is not taken.
  const r = await turn(null, "hi", join(root, "elsewhere", ".kaizen"));
  expect(readChat(base, r.id)!.project).toBeUndefined();
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

test.if(posix)("stop kills the agent and keeps what was said so far", async () => {
  fake(`echo '{"type":"thread.started","thread_id":"T2"}'\necho '{"type":"item.completed","item":{"type":"agent_message","text":"Working"}}'\nsleep 30`);
  const events: Event[] = [];
  await new Promise<void>((res) => sendChat(base, null, "long job", projA, board, (e) => {
    events.push(e);
    if (e.t === "text") stopChat(base, (events[0] as any).id);
    if (e.t === "done") res();
  }));
  const c = readChat(base, (events[0] as any).id)!;
  expect(c.messages[1]).toMatchObject({ role: "agent", text: "Working", error: "Stopped." });
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
  expect(parseLine(`{"type":"turn.started"}`)).toBeNull();
  expect(parseLine(`{"type":"item.completed","item":{"type":"error","message":"metadata"}}`)).toBeNull();
  expect(parseLine(JSON.stringify({ type: "item.completed", item: { type: "command_execution", command: `/bin/bash -lc "cat a.md"`, exit_code: 1 } })))
    .toEqual({ t: "step", step: { kind: "cmd", text: "cat a.md", ok: false } });
  expect(parseLine(`{"type":"item.completed","item":{"type":"file_change","changes":[{"path":"a.ts"}],"status":"completed"}}`))
    .toEqual({ t: "step", step: { kind: "edit", text: "a.ts", ok: true } });
  expect(takeMoves("ok\n\n[[kaizen:project A]]\n")).toEqual({ text: "ok", move: { op: "project", arg: "A" } });
  // Only a line of its own counts: a move quoted inside a sentence is text.
  expect(takeMoves("write `[[kaizen:project A]]` to move").move).toBeNull();
});
