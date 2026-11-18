// Everything the task page works out from one task and the handlers it calls, shared by the desktop page and the phone's:
// which result is shown, what the server lets the person do, the ⋯ menu, and the one message send. The layouts only draw it.
import { useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { host, useStore } from "@lib/core";
import { runAction, sendMessage } from "./use-task.ts";
import {
  canAcceptTask,
  closeActions,
  queuedInputs,
  runIdsOf,
  sortedResults,
  taskTitle,
  type TaskPageData,
  type TaskView,
} from "./tasks.ts";

export function useTaskPage(page: TaskPageData, t: TaskView, afterSend?: () => void) {
  const { pending, receipt, draft } = useStore(
    useShallow((s) => ({ pending: s.pending, receipt: s.receipt, draft: s.draft })),
  );
  const [picked, setPicked] = useState(""),
    [follow, setFollow] = useState(true),
    [artifactId, setArtifactId] = useState(""),
    [confirm, setConfirm] = useState<"" | "abandon" | "delete">(""),
    [denied, setDenied] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const results = sortedResults(page.results),
    current = results.find((r) => r.id === t.currentResultId),
    selected =
      follow && current ? current : (results.find((r) => r.id === picked) ?? current ?? results[results.length - 1]),
    selectedId = selected?.id ?? "",
    isCurrent = selectedId === t.currentResultId;
  const stop = t.actions?.stop ?? (!!t.activeRun && !["interrupted", "failed"].includes(t.status ?? ""));
  const resume = t.actions?.resume ?? ["interrupted", "failed"].includes(t.status ?? "");
  const start = !(
    t.actions?.start === false ||
    !t.dir ||
    !!t.activeRun ||
    !!t.currentResultId ||
    t.status !== "draft" ||
    t.decision?.kind === "project"
  );
  const accept = isCurrent && canAcceptTask(t, current);
  const queue = queuedInputs(t).filter((i) => i.state !== "dispatched");
  const close = closeActions(t);
  const runs = runIdsOf(t);
  const workspace = runs.length ? `?view=run&id=${runs[runs.length - 1]}&dir=${encodeURIComponent(t.dir)}` : undefined;
  const finish = async (op: string, extra: Record<string, unknown> = {}) => {
    const r = await runAction(op, extra);
    if (r?.ok) {
      history.pushState(null, "", "?view=tasks");
      host.go("tasks");
    }
  };
  const send = async () => {
    if (!(await sendMessage(selectedId))) return void input.current?.focus();
    setDenied(false);
    setFollow(true);
    afterSend?.();
    input.current?.focus();
  };
  const menu = [
    ...runs.map((id) => ({
      id: "run-" + id,
      label: "Open workspace",
      hint: id,
      href: `?view=run&id=${id}&dir=${encodeURIComponent(t.dir)}`,
    })),
    { id: "archive", label: "Archive", onSelect: () => void finish("archive") },
    ...(close.abandon
      ? [{ id: "abandon", label: "Abandon", danger: true, before: true, onSelect: () => setConfirm("abandon") }]
      : []),
    ...(close.delete
      ? [{ id: "delete", label: "Delete", danger: true, before: !close.abandon, onSelect: () => setConfirm("delete") }]
      : []),
  ];
  const help = t.activeRun
    ? "Changes are saved for the next safe pass. Questions do not interrupt production."
    : t.attention.category === "completed"
      ? "A new change stays in this task and starts a linked revision."
      : "Ask a question or describe a change. Your message stays with this task.";
  // Why a task that is not running says so: the failure, in plain words (the agent chip and the tabs carry the rest).
  const note = ["failed", "interrupted", "stopping"].includes(t.status ?? "")
    ? [t.attention?.reason, t.attention?.action, t.error].filter(Boolean).join(" · ")
    : "";
  return {
    title: taskTitle(t),
    pending,
    receipt,
    draft,
    results,
    selected,
    selectedId,
    current,
    isCurrent,
    picked: (id: string) => {
      setPicked(id);
      setFollow(id === t.currentResultId);
      setArtifactId("");
    },
    artifactId,
    setArtifactId,
    confirm,
    setConfirm,
    denied,
    setDenied,
    input,
    stop,
    resume,
    start,
    accept,
    queue,
    runs,
    workspace,
    finish,
    send,
    menu,
    help,
    note,
  };
}
export type TaskModel = ReturnType<typeof useTaskPage>;
