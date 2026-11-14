// One open task: fetch and poll it, and every action the page can take. Both hold the exact request logic of
// the old task page (revision and operationId on every /task call, stale-answer guards, the draft's stable
// operation id), so another page showing the same decision calls the same code.
import { useEffect } from "react";
import { getTask, taskRequest, host, getStore, setStore } from "@lib/core";
import { taskHref, type TaskView } from "./tasks.ts";

const operationId = () => crypto.randomUUID();
export const readDraft = (key: string) => {
  try {
    return sessionStorage.getItem("kz-task:" + key) || "";
  } catch {
    return "";
  }
};
export const saveDraft = (key: string, text: string) => {
  try {
    sessionStorage.setItem("kz-task:" + key, text);
  } catch {}
};
export function navigateTask(t: Pick<TaskView, "id" | "dir">, replace = false) {
  (replace ? history.replaceState : history.pushState).call(history, null, "", taskHref(t));
  host.go("task");
}
export async function openTaskRecord(t: TaskView) {
  if (t.legacy) {
    const r = await taskRequest({ op: "adopt", dir: t.dir, legacy: t.legacy, operationId: operationId() });
    if (r.ok && r.task) return navigateTask(r.task);
    return;
  }
  navigateTask(t);
}
// The page the address names. A different task starts empty; the same one keeps what it shows while it reloads.
export function showTask() {
  const p = new URLSearchParams(location.search),
    id = p.get("task") || "",
    dir = p.get("dir") || "";
  const s = getStore();
  if (id !== s.taskId || dir !== s.taskDir)
    setStore({
      taskId: id,
      taskDir: dir,
      page: null,
      pageError: "",
      pending: false,
      receipt: "",
      draft: readDraft(id),
      view: "task",
    });
  else setStore({ view: "task" });
}

let generation = 0;
export async function refreshTask() {
  const { taskId: id, taskDir: dir } = getStore();
  if (!id) return;
  const gen = ++generation;
  try {
    const { ok, body: next } = await getTask(id, dir);
    const now = getStore();
    if (gen !== generation || id !== now.taskId || now.view !== "task") return;
    if (!ok || !next.task) {
      if (!now.page) setStore({ pageError: next.why || next.error || "Refresh or return to Tasks." });
      return;
    }
    if (now.page && next.task.revision < now.page.task.revision) return;
    setStore({ page: next, pageError: "" });
    const rest = (host.attentionTasks() ?? []) as TaskView[];
    host.setTaskAttention([...rest.filter((t) => t.id !== next.task.id || t.dir !== next.task.dir), next.task]);
  } catch {
    if (!getStore().page) setStore({ pageError: "offline" });
  }
}
// Mounted while the task page shows: load now, then every 4 seconds and on every board state tick.
export function useTask() {
  useEffect(() => {
    void refreshTask();
    let timer: ReturnType<typeof setTimeout>;
    const poll = () => {
      void refreshTask();
      timer = setTimeout(poll, 4000);
    };
    timer = setTimeout(poll, 4000);
    const tick = () => void refreshTask();
    addEventListener("kz-state", tick);
    return () => {
      generation++;
      clearTimeout(timer);
      removeEventListener("kz-state", tick);
    };
  }, []);
}

const RECEIPTS: Record<string, string> = {
  stop: "Cancellation requested. Waiting for confirmation; saved files are not rolled back.",
  accept: "Result accepted. It has not been published by this action.",
  confirm: "Plan approved.",
};
// One /task operation. Never two at once; a task that changed identity under it is followed.
export async function runAction(op: string, extra: Record<string, unknown> = {}) {
  const { page, pending } = getStore();
  if (pending || !page) return;
  setStore({ pending: true });
  const request = {
    op,
    id: page.task.id,
    dir: page.task.dir,
    operationId: operationId(),
    revision: page.task.revision,
    ...extra,
  };
  const r = await taskRequest(request);
  setStore({ pending: false });
  const { taskId, taskDir, page: cur } = getStore();
  if (r.task && r.ok) {
    if (r.task.dir !== taskDir || r.task.id !== taskId) return navigateTask(r.task, true);
    if (cur) setStore({ page: { ...cur, task: r.task } });
  }
  if (r.ok) setStore({ receipt: RECEIPTS[op] ?? "Saved." });
  await refreshTask();
  if (r.conflict)
    setStore({
      receipt:
        "This task changed. Your message is still saved. Review the current result and send it again when ready.",
    });
  return r;
}
export const setDraft = (text: string) => {
  setStore({ draft: text });
  saveDraft(getStore().taskId, text);
};
// Send the composer's text. The same text for the same result and decision reuses one operation id, so a retry
// after a lost answer cannot send it twice. `selected` is the result the page shows.
export async function sendMessage(selected: string) {
  const { draft, page, pending, taskId } = getStore();
  const text = draft.trim();
  if (!text || pending || !page) return false;
  const baseResultId = selected || page.task.currentResultId || null;
  const identity = JSON.stringify([text, baseResultId, page.task.decision?.id, "auto"]);
  let saved;
  try {
    saved = JSON.parse(readDraft(taskId + ":operation"));
  } catch {}
  const messageOperation = saved?.identity === identity ? saved.id : operationId();
  saveDraft(taskId + ":operation", JSON.stringify({ identity, id: messageOperation }));
  const r = await runAction("message", {
    operationId: messageOperation,
    text,
    intent: "auto",
    baseResultId,
    decisionId: page.task.decision?.id,
  });
  // Typing while it was sending keeps what was typed.
  if (r?.ok && getStore().draft === draft) {
    setDraft("");
    saveDraft(taskId + ":operation", "");
    setStore({ receipt: "Message received. Follow its receipt in the conversation." });
    return true;
  }
  return false;
}
