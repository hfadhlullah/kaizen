// Home's chat: conversations with kaizen's main agent, kept under ~/.kaizen/chats/<id>.json.
// A chat may be in a project (its .kaizen dir) or in none; the agent can move it to another
// project or make a new one. The agent is Codex, run headless per message (`codex exec
// --json`), and a follow-up continues its thread with `exec resume`.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { CHILD_ENV, readText } from "./state.ts";

export type Step = { kind: "cmd" | "edit" | "tool" | "project"; text: string; ok?: boolean };
export type Attachment = { name: string; path: string; image: boolean };
export type Upload = { name: string; bytes: Uint8Array };
export type Msg = { role: "user" | "agent"; text: string; files?: Attachment[]; steps?: Step[]; error?: string; activity?: string; at: string };
export type Chat = { id: string; title: string; project?: string; thread?: string; created: string; updated: string; messages: Msg[] };
// What the page is streamed while a turn runs, one JSON object per line.
export type Event =
  | { t: "chat"; id: string }
  | { t: "text"; text: string }
  | { t: "status"; text: string }
  | { t: "step"; step: Step }
  | { t: "project"; dir: string | null }
  | { t: "run"; dir: string }
  | { t: "error"; error: string }
  | { t: "done" };
// What the board knows, handed in by the server: its projects (state dirs), how it makes one,
// the agents installed, and how it starts a kaizen run in a project.
export type Board = {
  projects: { dir: string; label: string }[];
  create: (name: string) => Promise<{ dir: string } | { error: string }>;
  agents: string[];
  run: (dir: string, runner: "lite" | "full", agent: string, text: string) => Promise<{ agent: string } | { error: string }>;
};
// The project folders the agent may write in: every listed one, capped like the brief's list.
const roots = (board: Board) => board.projects.slice(0, 80).map((p) => dirname(p.dir));

export const okId = (id: unknown): id is string => typeof id === "string" && /^[\w-]{1,80}$/.test(id);
const file = (base: string, id: string) => join(base, "chats", `${id}.json`);
const uploadDir = (base: string, id: string) => join(base, "chats", id, "attachments");
const imageFile = (b: Uint8Array) =>
  (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) ||
  (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
  (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) ||
  (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && String.fromCharCode(...b.slice(8, 12)) === "WEBP");

function saveUploads(base: string, id: string, uploads: Upload[]): Attachment[] {
  const dir = uploadDir(base, id);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const paths: string[] = [];
  try {
    return uploads.map((u) => {
      const name = u.name.replace(/[^\w.-]+/g, "_").replace(/^\.+/, "").slice(0, 100) || "file";
      const path = join(dir, `${randomUUID()}-${name}`);
      paths.push(path);
      writeFileSync(path, u.bytes, { mode: 0o600 });
      return { name, path, image: imageFile(u.bytes) };
    });
  } catch (err) {
    for (const path of paths) rmSync(path, { force: true });
    throw err;
  }
}

// Ahead of every message, so a switch or a new project is known on the next turn; the page never shows it.
export function brief(c: Chat, board: Board) {
  const here = board.projects.find((p) => p.dir === c.project);
  const list = board.projects.slice(0, 80).map((p) => `- ${p.label} — ${dirname(p.dir)}`).join("\n");
  return `[kaizen board context, not written by the user]
You are kaizen's main agent, talking with the user from the kaizen board's Home page.
Project of this chat: ${here ? `${here.label} (${dirname(here.dir)})` : "none — you are in a scratch folder"}.
Projects on the board:
${list || "(none)"}
You can read, analyse and edit files in any project folder listed above directly by its path; you do not need to switch to it. Do not write outside those folders and your working folder.
Switching only changes this chat's home project (where you run and which project the board shows). On a line of its own write [[kaizen:project <folder>]] to switch to a listed project, or [[kaizen:new-project <name>]] to create one (a plain folder name). Switch only when the user asks; when what they want fits no listed project, ask whether to create a new one. After a successful move, the board starts one follow-up turn in the new project to finish the pending request; do not ask the user to repeat it.
When the user asks you to develop, fix, change or enhance something (not a question, analysis or reading), first ask which way, as numbered options, and do nothing until they pick:
1. Start a kaizen run for it: lite (cheap, one session) or full (independent review), with which agent (installed: ${board.agents.join(", ") || "none"}), in which project.
2. Let you handle it here in the chat.
For 1, once they pick, write on a line of its own [[kaizen:run <project folder> | <lite or full> | <agent> | <the request, one line>]]; the board starts the run in that project and it shows there. Do not start it yourself with /kaizen. For 2, do the work directly.
Keep replies short.
[end of context]

`;
}

export function readChat(base: string, id: string): Chat | null {
  if (!okId(id)) return null;
  try { return JSON.parse(readText(file(base, id))); } catch { return null; }
}

function save(base: string, c: Chat) {
  mkdirSync(join(base, "chats"), { recursive: true });
  writeFileSync(file(base, c.id), JSON.stringify(c, null, 2));
}

// Newest first, without the messages.
export function listChats(base: string) {
  const d = join(base, "chats");
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((f) => f.endsWith(".json"))
    .map((f) => readChat(base, f.slice(0, -5)))
    .filter((c): c is Chat => !!c)
    .map(({ id, title, project, updated }) => ({ id, title, project: project ?? null, updated, busy: live.has(base + "|" + id) }))
    .sort((a, b) => b.updated.localeCompare(a.updated));
}

export function deleteChat(base: string, id: string) {
  if (!okId(id)) return "bad chat id";
  if (live.has(base + "|" + id)) return "this chat is still working";
  rmSync(file(base, id), { force: true });
  rmSync(join(base, "chats", id), { recursive: true, force: true });
  return null;
}

// One turn at a time per chat; the page can leave and the turn still finishes and saves.
const live = new Map<string, { kill: () => void }>();
export const busy = (base: string, id: string) => live.has(base + "|" + id);

export function stopChat(base: string, id: string) {
  const p = live.get(base + "|" + id);
  p?.kill();
  return !!p;
}

const short = (s: string, n = 120) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const command = (s: unknown) => short(String(s ?? "").replace(/^\S*\/(?:ba|z)?sh -lc (?:(['"])([\s\S]*)\1|([\s\S]*))$/, "$2$3"));

// One `codex exec --json` line as what the page shows; null for what it does not.
export function parseLine(line: string): Event | { t: "thread"; id: string } | null {
  let e: any;
  try { e = JSON.parse(line); } catch { return null; }
  if (e?.type === "thread.started" && typeof e.thread_id === "string") return { t: "thread", id: e.thread_id };
  if (e?.type === "turn.failed") return { t: "error", error: String(e.error?.message ?? "the agent failed") };
  if (e?.type === "turn.started") return { t: "status", text: "Thinking…" };
  if (e?.type === "item.started" && e.item) {
    const it = e.item;
    if (it.type === "command_execution") return { t: "status", text: `Running ${command(it.command) || "a command"}` };
    if (it.type === "mcp_tool_call") return { t: "status", text: `Using ${short(`${it.server ?? ""} ${it.tool ?? ""}`.trim()) || "a tool"}` };
    if (it.type === "web_search") return { t: "status", text: "Searching the web…" };
    if (it.type === "file_change") return { t: "status", text: "Editing files…" };
    if (it.type === "reasoning") return { t: "status", text: "Thinking…" };
    if (it.type === "agent_message") return { t: "status", text: "Writing reply…" };
    return null;
  }
  if (e?.type !== "item.completed" || !e.item) return null;
  const it = e.item;
  if (it.type === "agent_message" && it.text) return { t: "text", text: String(it.text) };
  if (it.type === "command_execution")
    return { t: "step", step: { kind: "cmd", text: command(it.command), ok: it.exit_code === 0 } };
  if (it.type === "file_change" && Array.isArray(it.changes))
    return { t: "step", step: { kind: "edit", text: short(it.changes.map((c: any) => c.path).join(", ")), ok: it.status !== "failed" } };
  if (it.type === "mcp_tool_call") return { t: "step", step: { kind: "tool", text: short(`${it.server ?? ""} ${it.tool ?? ""}`.trim()), ok: it.status !== "failed" } };
  if (it.type === "web_search") return { t: "step", step: { kind: "tool", text: "Web search", ok: it.status !== "failed" } };
  return null;
}

// The agent's move and run lines: taken out of what the user reads; the last of each counts.
const MOVE = /^[ \t]*\[\[kaizen:(project|new-project|run)[ \t]+([^\]\n]+?)\]\][ \t]*$/gm;
export type RunAsk = { project: string; runner: string; agent: string; text: string };
export function takeMoves(text: string) {
  let move: { op: "project" | "new-project"; arg: string } | null = null;
  let run: RunAsk | null = null;
  const rest = text.replace(MOVE, (_, op, arg) => {
    if (op !== "run") move = { op, arg: arg.trim() };
    else {
      const [project = "", runner = "", agent = "", ...t] = arg.split("|").map((x: string) => x.trim());
      run = { project, runner, agent, text: t.join(" | ").trim() };
    }
    return "";
  }).replace(/\n{3,}/g, "\n\n").trim();
  return { text: rest, move: move as { op: "project" | "new-project"; arg: string } | null, run: run as RunAsk | null };
}

// Not winShim: the message goes in on stdin, so the .cmd shim's newline limit never applies.
const codexBin = () => Bun.which("codex", { PATH: process.env.PATH });

// project: where a new chat starts (a state dir the board knows), ignored for an existing chat.
export function sendChat(base: string, id: string | null, text: string, project: string | null, board: Board, emit: (e: Event) => void, reuseReply = false, uploads: Upload[] = []): string | null {
  const bin = codexBin();
  if (!bin) return "Chat needs Codex: install it (npm i -g @openai/codex) and sign in.";
  const now = new Date().toISOString();
  let c = id ? readChat(base, id) : null;
  if (id && !c) return "no such chat";
  if (!c) c = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: short(text.split("\n")[0] || uploads[0]?.name || "Chat", 60),
    project: board.projects.some((p) => p.dir === project) ? project! : undefined, created: now, updated: now, messages: [],
  };
  const key = base + "|" + c.id;
  if (live.has(key)) return "this chat is still working";
  const chat = c;
  if (reuseReply && chat.messages.at(-1)?.role !== "agent") return "no reply to continue";
  if (uploads.length > 20 || uploads.some((u) => !u.name || u.bytes.length > 100 * 1024 * 1024) || uploads.reduce((n, u) => n + u.bytes.length, 0) > 300 * 1024 * 1024) return "up to 20 files, 100 MB each and 300 MB total";
  // A project that left the board since: the chat goes on without one.
  if (chat.project && !board.projects.some((p) => p.dir === chat.project)) chat.project = undefined;
  let files: Attachment[] = [];
  try { if (uploads.length) files = saveUploads(base, chat.id, uploads); }
  catch (err: any) { return `Could not save attachment: ${err?.message ?? err}`; }
  if (!reuseReply) chat.messages.push({ role: "user", text, ...(files.length ? { files } : {}), at: now });
  const reply: Msg = reuseReply ? chat.messages.at(-1)! : { role: "agent", text: "", steps: [], at: now };
  if (!reuseReply) chat.messages.push(reply);
  reply.activity = "Thinking…";
  chat.updated = now;
  save(base, chat);

  // No project: a scratch folder outside every project.
  const scratch = join(base, "chats", "scratch");
  if (!chat.project) mkdirSync(scratch, { recursive: true });
  const cwd = chat.project ? dirname(chat.project) : scratch;
  // Same scrub as launchRun: a board started inside an agent session must not hand that identity on.
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !CHILD_ENV.test(k)) env[k] = v;
  const images = files.filter((f) => f.image).flatMap((f) => ["-i", f.path]);
  // Every listed project is writable, so the agent works on any of them without a switch.
  const dirs = roots(board).filter((d) => d !== cwd).flatMap((d) => ["--add-dir", d]);
  const argv = [bin, "exec", "--json", "--skip-git-repo-check", "-s", "workspace-write", ...dirs,
    "-m", "gpt-6-luna", "-c", "model_reasoning_effort=medium", ...(chat.thread ? ["resume", chat.thread] : []), ...images, "-"];
  let p;
  try { p = Bun.spawn(argv, { cwd, env, stdin: "pipe", stdout: "pipe", stderr: "pipe" }); }
  catch (err: any) {
    reply.error = `Could not start codex: ${err?.message ?? err}`;
    delete reply.activity;
    save(base, chat);
    return reply.error;
  }
  p.stdin.write(brief(chat, board) + text + (files.length ? `\n\nAttached files (read these paths as needed):\n${files.map((f) => `- ${f.name}: ${f.path}`).join("\n")}` : ""));
  p.stdin.end();
  // Read alongside stdout: an undrained stderr pipe fills and stalls the agent.
  const errText = new Response(p.stderr).text();
  let stopped = false;
  // Stop also lets go of stdout: a grandchild the agent started can hold the pipe open after it dies.
  const reader = (p.stdout as ReadableStream<Uint8Array>).getReader();
  live.set(key, { kill: () => { stopped = true; p.kill(); reader.cancel().catch(() => {}); } });
  emit({ t: "chat", id: chat.id });

  (async () => {
    const dec = new TextDecoder();
    let buf = "";
    let move: ReturnType<typeof takeMoves>["move"] = null;
    let run: RunAsk | null = null;
    const take = (line: string) => {
      const e = parseLine(line);
      if (!e) return;
      if (e.t === "thread") { chat.thread = e.id; save(base, chat); return; }
      if (e.t === "text") {
        const m = takeMoves(e.text);
        if (m.move) move = m.move;
        if (m.run) run = m.run;
        if (!m.text) return;
        e.text = m.text;
        reply.text += (reply.text ? "\n\n" : "") + e.text;
      }
      if (e.t === "step") reply.steps!.push(e.step);
      if (e.t === "status") reply.activity = e.text;
      if (e.t === "step") reply.activity = "Thinking…";
      if (e.t === "error") reply.error = e.error;
      save(base, chat);
      emit(e);
    };
    try {
      for (let r; !(r = await reader.read()).done;) {
        buf += dec.decode(r.value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) { take(buf.slice(0, i)); buf = buf.slice(i + 1); }
      }
      if (buf.trim()) take(buf);
      const code = await p.exited;
      if (stopped) { reply.error = "Stopped."; emit({ t: "error", error: reply.error }); }
      else if (code !== 0 && !reply.error && !reply.text) {
        const err = (await errText).trim().split("\n").filter((l) => !/^\S+Z\s+(WARN|ERROR) /.test(l)).slice(-3).join("\n");
        reply.error = err || `codex exited with code ${code}`;
        emit({ t: "error", error: reply.error });
      }
      if (run && !stopped) await startRun(reply, run, board, emit);
      if (move && !stopped) await moveChat(chat, reply, move, board, emit);
    } finally {
      delete reply.activity;
      chat.updated = new Date().toISOString();
      save(base, chat);
      live.delete(key);
      emit({ t: "done" });
    }
  })();
  return null;
}

const findProject = (board: Board, arg: string) => {
  const a = arg.replace(/[\\/]+$/, "");
  return board.projects.find((x) => x.dir === a || dirname(x.dir) === a || x.dir === join(a, ".kaizen"))
    ?? board.projects.find((x) => x.label === a || basename(dirname(x.dir)) === a);
};

// Start the run the user picked: only in a listed project, with an installed agent.
async function startRun(reply: Msg, ask: RunAsk, board: Board, emit: (e: Event) => void) {
  const step = (text: string, ok: boolean) => { const s: Step = { kind: "project", text, ok }; reply.steps!.push(s); emit({ t: "step", step: s }); };
  const p = findProject(board, ask.project);
  if (!p) return step(`No project ${ask.project} on the board`, false);
  if (ask.runner !== "lite" && ask.runner !== "full") return step(`Unknown runner ${ask.runner}`, false);
  if (!board.agents.includes(ask.agent)) return step(`Agent ${ask.agent} is not installed`, false);
  if (!ask.text) return step("No request for the run", false);
  const r = await board.run(p.dir, ask.runner, ask.agent, ask.text);
  if ("error" in r) return step(`Could not start the run: ${r.error}`, false);
  step(`Started a ${ask.runner} run in ${p.label} with ${r.agent}`, true);
  emit({ t: "run", dir: p.dir });
}

// Apply the agent's move: only to a project the board lists, or one the board's own rules create.
async function moveChat(chat: Chat, reply: Msg, move: { op: string; arg: string }, board: Board, emit: (e: Event) => void) {
  const step = (text: string, ok: boolean) => { const s: Step = { kind: "project", text, ok }; reply.steps!.push(s); emit({ t: "step", step: s }); };
  let dir: string | null = null;
  if (move.op === "project") {
    const p = findProject(board, move.arg);
    if (!p) return step(`No project ${move.arg} on the board`, false);
    dir = p.dir;
  } else {
    const r = await board.create(move.arg);
    if ("error" in r) return step(`Could not create ${move.arg}: ${r.error}`, false);
    dir = r.dir;
    board.projects.push({ dir, label: move.arg });
  }
  if (dir === chat.project) return;
  chat.project = dir;
  step(`${move.op === "new-project" ? "Created" : "Switched to"} ${board.projects.find((x) => x.dir === dir)?.label ?? move.arg}`, true);
  emit({ t: "project", dir });
}
