// Every request the Tasks pages make, in one place: the same routes and payloads the old pages sent
// (/tasks?all=1, /task?id=&dir=, POST /task, /frameable, /expose), and the Icebox's (/sources, POST /icebox).
import { host } from "./host.ts";
import { toast } from "./toast.ts";
import type { TaskPageData, TaskView } from "@lib/task";

export type TaskReply = {
  ok: boolean;
  conflict?: boolean;
  task?: TaskView;
  why?: string;
  error?: string;
  [k: string]: unknown;
};
export async function taskRequest(body: Record<string, unknown>): Promise<TaskReply> {
  try {
    const r = await fetch("/task", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const value = await r.json();
    if (!r.ok || value.ok === false) {
      toast(value.why || value.error || "That did not work. Your message is still saved here.");
      return { ...value, ok: false, conflict: r.status === 409 };
    }
    return { ...value, ok: true };
  } catch {
    toast("The server could not be reached. Your draft is still here; try again.");
    return { ok: false };
  }
}
export async function getTasks(): Promise<TaskView[]> {
  const r = await fetch("/tasks?all=1"),
    body = await r.json();
  if (!r.ok) throw new Error(body.why || body.error || "Tasks could not be loaded");
  return body.tasks ?? [];
}
export async function getTask(
  id: string,
  dir: string,
): Promise<{ ok: boolean; body: TaskPageData & { why?: string; error?: string } }> {
  const r = await fetch(`/task?id=${encodeURIComponent(id)}&dir=${encodeURIComponent(dir)}`);
  return { ok: r.ok, body: await r.json() };
}
export const getText = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error();
  return r.text();
};
export const frameable = async (url: string): Promise<{ frameable?: boolean }> =>
  (await fetch("/frameable?url=" + encodeURIComponent(url))).json();
export const expose = async (url: string): Promise<{ ok?: boolean; url?: string; hint?: string }> =>
  (
    await fetch("/expose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    })
  ).json();
// The Icebox's requests: a JSON POST carrying the board's project header, as the old pages' post() did. A
// failure toasts the server's words (with a prefilled bug link) and answers { ok: false }.
const GONE = "The kaizen server is not running — start it with kaizen web (or the shortcut), then reload.";
export async function post(path: string, body: Record<string, unknown>): Promise<Record<string, any>> {
  let r: Response;
  try {
    r = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...host.dirHeader() },
      body: JSON.stringify(body),
    });
  } catch {
    toast(GONE);
    return { ok: false };
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = j.error || j.why || "That did not work";
    toast(m, { title: m.slice(0, 80), what: `POST ${path} failed (HTTP ${r.status}): ${m}` });
  }
  return j;
}
export const getSources = async (dir: string): Promise<import("@lib/icebox").IceData | null> =>
  fetch("/sources" + (dir ? "?dir=" + encodeURIComponent(dir) : ""))
    .then((r) => r.json())
    .catch(() => null);
