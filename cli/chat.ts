// Home's chat: conversations with kaizen's main agent, kept under ~/.kaizen/chats/<id>.json.
// A chat may be in a project (its .kaizen dir) or in none; the agent can move it to another
// project or make a new one. The agent is Codex, run headless per message (`codex exec
// --json`), and a follow-up continues its thread with `exec resume`.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { agentFlags, CHILD_ENV, readText } from "./state.ts";

export type Step = { kind: "cmd" | "edit" | "tool" | "project"; text: string; ok?: boolean };
export type Msg = { role: "user" | "agent"; text: string; steps?: Step[]; error?: string; at: string };
export type Chat = { id: string; title: string; project?: string; thread?: string; created: string; updated: string; messages: Msg[] };
// What the page is streamed while a turn runs, one JSON object per line.
export type Event =
  | { t: "chat"; id: string }
  | { t: "text"; text: string }
  | { t: "step"; step: Step }
  | { t: "project"; dir: string | null }
  | { t: "error"; error: string }
  | { t: "done" };
// What the board knows, handed in by the server: its projects (state dirs) and how it makes one.
export type Board = {
  projects: { dir: string; label: string }[];
  create: (name: string) => Promise<{ dir: string } | { error: string }>;
};

export const okId = (id: unknown): id is string => typeof id === "string" && /^[\w-]{1,80}$/.test(id);
const file = (base: string, id: string) => join(base, "chats", `${id}.json`);

// Ahead of every message, so a switch or a new project is known on the next turn; the page never shows it.
export function brief(c: Chat, board: Board) {
  const here = board.projects.find((p) => p.dir === c.project);
  const list = board.projects.slice(0, 80).map((p) => `- ${p.label} — ${dirname(p.dir)}`).join("\n");
  return `[kaizen board context, not written by the user]
You are kaizen's main agent, talking with the user from the kaizen board's Home page.
Project of this chat: ${here ? `${here.label} (${dirname(here.dir)})` : "none — you are in a scratch folder and cannot edit files"}.
Projects on the board:
${list || "(none)"}
You can move this chat. On a line of its own write [[kaizen:project <folder>]] to switch to a project listed above, or [[kaizen:new-project <name>]] to create one (a plain folder name). Do it when the user asks. When they talk about another listed project, ask whether to switch; when what they want fits no listed project, ask whether to create a new one. The move takes effect from their next message: say so, and do not touch files outside your working folder.
kaizen is installed: for work worth a plan and an independent review, start a run with /kaizen <request> (the kaizen skill); it shows on the board. Small things you may do directly. Keep replies short.
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

// One `codex exec --json` line as what the page shows; null for what it does not.
export function parseLine(line: string): Event | { t: "thread"; id: string } | null {
  let e: any;
  try { e = JSON.parse(line); } catch { return null; }
  if (e?.type === "thread.started" && typeof e.thread_id === "string") return { t: "thread", id: e.thread_id };
  if (e?.type === "turn.failed") return { t: "error", error: String(e.error?.message ?? "the agent failed") };
  if (e?.type !== "item.completed" || !e.item) return null;
  const it = e.item;
  if (it.type === "agent_message" && it.text) return { t: "text", text: String(it.text) };
  if (it.type === "command_execution")
    return { t: "step", step: { kind: "cmd", text: short(String(it.command ?? "").replace(/^\S*\/(?:ba|z)?sh -lc (?:(['"])([\s\S]*)\1|([\s\S]*))$/, "$2$3")), ok: it.exit_code === 0 } };
  if (it.type === "file_change" && Array.isArray(it.changes))
    return { t: "step", step: { kind: "edit", text: short(it.changes.map((c: any) => c.path).join(", ")), ok: it.status !== "failed" } };
  if (it.type === "mcp_tool_call") return { t: "step", step: { kind: "tool", text: short(`${it.server ?? ""} ${it.tool ?? ""}`.trim()), ok: it.status !== "failed" } };
  return null;
}

// The agent's move lines: taken out of what the user reads; the last one counts.
const MOVE = /^[ \t]*\[\[kaizen:(project|new-project)[ \t]+([^\]\n]+?)\]\][ \t]*$/gm;
export function takeMoves(text: string) {
  let move: { op: "project" | "new-project"; arg: string } | null = null;
  const rest = text.replace(MOVE, (_, op, arg) => { move = { op, arg: arg.trim() }; return ""; }).replace(/\n{3,}/g, "\n\n").trim();
  return { text: rest, move: move as { op: "project" | "new-project"; arg: string } | null };
}

// Not winShim: the message goes in on stdin, so the .cmd shim's newline limit never applies.
const codexBin = () => Bun.which("codex", { PATH: process.env.PATH });

// project: where a new chat starts (a state dir the board knows), ignored for an existing chat.
export function sendChat(base: string, id: string | null, text: string, project: string | null, board: Board, emit: (e: Event) => void): string | null {
  const bin = codexBin();
  if (!bin) return "Chat needs Codex: install it (npm i -g @openai/codex) and sign in.";
  const now = new Date().toISOString();
  let c = id ? readChat(base, id) : null;
  if (id && !c) return "no such chat";
  if (!c) c = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, title: short(text.split("\n")[0], 60),
    project: board.projects.some((p) => p.dir === project) ? project! : undefined, created: now, updated: now, messages: [],
  };
  const key = base + "|" + c.id;
  if (live.has(key)) return "this chat is still working";
  const chat = c;
  // A project that left the board since: the chat goes on without one.
  if (chat.project && !board.projects.some((p) => p.dir === chat.project)) chat.project = undefined;
  chat.messages.push({ role: "user", text, at: now });
  const reply: Msg = { role: "agent", text: "", steps: [], at: now };
  chat.messages.push(reply);
  chat.updated = now;
  save(base, chat);

  // No project: a scratch folder outside every project, read-only.
  const scratch = join(base, "chats", "scratch");
  if (!chat.project) mkdirSync(scratch, { recursive: true });
  const cwd = chat.project ? dirname(chat.project) : scratch;
  // Same scrub as launchRun: a board started inside an agent session must not hand that identity on.
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !CHILD_ENV.test(k)) env[k] = v;
  const argv = [bin, "exec", "--json", "--skip-git-repo-check", "-s", chat.project ? "workspace-write" : "read-only",
    ...agentFlags(cwd, "codex"), ...(chat.thread ? ["resume", chat.thread] : []), "-"];
  let p;
  try { p = Bun.spawn(argv, { cwd, env, stdin: "pipe", stdout: "pipe", stderr: "pipe" }); }
  catch (err: any) {
    reply.error = `Could not start codex: ${err?.message ?? err}`;
    save(base, chat);
    return reply.error;
  }
  p.stdin.write(brief(chat, board) + text);
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
    const take = (line: string) => {
      const e = parseLine(line);
      if (!e) return;
      if (e.t === "thread") { chat.thread = e.id; return; }
      if (e.t === "text") {
        const m = takeMoves(e.text);
        if (m.move) move = m.move;
        if (!m.text) return;
        e.text = m.text;
        reply.text += (reply.text ? "\n\n" : "") + e.text;
      }
      if (e.t === "step") reply.steps!.push(e.step);
      if (e.t === "error") reply.error = e.error;
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
      if (move && !stopped) await moveChat(chat, reply, move, board, emit);
    } finally {
      chat.updated = new Date().toISOString();
      save(base, chat);
      live.delete(key);
      emit({ t: "done" });
    }
  })();
  return null;
}

// Apply the agent's move: only to a project the board lists, or one the board's own rules create.
async function moveChat(chat: Chat, reply: Msg, move: { op: string; arg: string }, board: Board, emit: (e: Event) => void) {
  const step = (text: string, ok: boolean) => { const s: Step = { kind: "project", text, ok }; reply.steps!.push(s); emit({ t: "step", step: s }); };
  let dir: string | null = null;
  if (move.op === "project") {
    const a = move.arg.replace(/[\\/]+$/, "");
    const p = board.projects.find((x) => x.dir === a || dirname(x.dir) === a || x.dir === join(a, ".kaizen"))
      ?? board.projects.find((x) => x.label === a || basename(dirname(x.dir)) === a);
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
