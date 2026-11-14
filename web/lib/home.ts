// Home: a chat with kaizen's main agent (cli/chat.ts). The rules the page and its store share, without the page.
export type Step = { kind?: string; text: string; ok?: boolean };
export type Msg = {
  role: "user" | "agent";
  text: string;
  at?: string;
  files?: { name: string }[];
  steps?: Step[];
  error?: string;
  activity?: string;
};
export type Chat = { id: string | null; title: string; project: string | null; messages: Msg[]; busy?: boolean; updated?: string };
export type ListedChat = { id: string; title: string; project?: string | null; busy?: boolean; updated: string };
export type StreamEvent =
  | { t: "chat"; id: string }
  | { t: "text"; text: string }
  | { t: "status"; text: string }
  | { t: "step"; step: Step }
  | { t: "error"; error: string }
  | { t: "project"; dir: string };

export const SUGGEST = ["What's waiting on me?", "Summarize what changed this week", "Plan a new feature: ", "Review my last change"];
export const MAX_FILES = 5,
  MAX_FILE = 10 * 1024 * 1024,
  MAX_TOTAL = 20 * 1024 * 1024;

// Run ids the agent named that are cards on this board: each becomes a button to its card.
export const runsIn = (text: string, runIds: string[]) =>
  [...new Set(text.match(/\b\d{4}-\d{2}-\d{2}-[a-z0-9-]+\b/g) || [])].filter((id) => runIds.includes(id));
// A project shows by its folder name alone.
export const short = (l: string) => l.split(/[\\/]/).pop() || l;
export const projectName = (dir: string, projects: { dir: string; label: string }[]) =>
  short(projects.find((p) => p.dir === dir)?.label || String(dir).replace(/[\\/]\.kaizen$/, ""));
// Whether one more file fits: 5 files, 10 MB each, 20 MB together.
export const fits = (have: File[], f: File) =>
  have.length < MAX_FILES && f.size <= MAX_FILE && have.reduce((n, x) => n + x.size, 0) + f.size <= MAX_TOTAL;
// What a streamed line says; a line that is not JSON is skipped.
export function readLine(line: string): StreamEvent | null {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}
// One streamed event applied to the open chat and its reply; returns the project dir when the agent moved the chat.
export function applyEvent(cur: Chat, reply: Msg, e: StreamEvent): { id?: string; project?: string } {
  if (e.t === "chat") {
    cur.id = e.id;
    return { id: e.id };
  }
  if (e.t === "text") reply.text += (reply.text ? "\n\n" : "") + e.text;
  if (e.t === "status") reply.activity = e.text;
  if (e.t === "step") {
    (reply.steps ||= []).push(e.step);
    reply.activity = "Thinking…";
  }
  if (e.t === "error") reply.error = e.error;
  if (e.t === "project") {
    cur.project = e.dir;
    return { project: e.dir };
  }
  return {};
}
// The messages of one streamed body, split on newlines as they arrive: feed chunks, get the complete lines.
export function lines() {
  let buf = "";
  return (chunk: string) => {
    buf += chunk;
    const out: string[] = [];
    for (let i; (i = buf.indexOf("\n")) >= 0; ) (out.push(buf.slice(0, i)), (buf = buf.slice(i + 1)));
    return out;
  };
}
