// Every request the Tasks pages make, in one place: the same routes and payloads the old pages sent
// (/tasks?all=1, /task?id=&dir=, POST /task, /frameable, /expose).
import { toast } from "./toast.ts";
import type { TaskPageData, TaskView } from "./tasks.ts";

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
