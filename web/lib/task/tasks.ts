// Task data shapes and the rules about them that have no screen: which tasks a filter shows, when Looks good
// is allowed, what a task's route and status line are. The pages and the tests share these.
import type { TaskResult } from "./task-results.ts";

export type TaskAttention = { category: "needs-you" | "in-progress" | "completed"; reason: string; action: string };
export type TaskDecision = {
  id: string;
  kind: "question" | "proposal" | "project" | string;
  text: string;
  summary?: string;
  details?: string;
  options?: string[];
};
export type TaskMessage = { id: string; role: string; text: string; type?: string; at?: number | string };
export type TaskView = {
  id: string;
  dir: string;
  title: string;
  goal: string;
  revision: number;
  updatedAt?: number | string;
  status?: string;
  attention: TaskAttention;
  decision?: TaskDecision | null;
  pendingDecision?: unknown;
  messages?: TaskMessage[];
  inputs?: { id: string; text: string; state: string; at?: number | string }[];
  activeRun?: string | null;
  runs?: (string | { id: string })[];
  acceptedResultId?: string | null;
  currentResultId?: string | null;
  files?: { name: string; url?: string }[];
  legacy?: { kind: string; id?: string; text?: string; state?: string };
  error?: string;
  projectName?: string;
  queuePaused?: boolean;
  agentAlive?: boolean;
  agentAsking?: boolean;
  runStage?: string;
  // What the server allows now; the page draws this list and decides nothing itself.
  actions?: {
    accept: boolean;
    acceptWhy?: string;
    stop: boolean;
    resume: boolean;
    abandon: boolean;
    archive: boolean;
    delete: boolean;
    start: boolean;
  };
};
export type TaskPageData = {
  task: TaskView;
  results?: TaskResult[];
  projects?: { dir: string; name?: string; label?: string }[];
  defaults?: { agent?: string; workflow?: string; permissions?: string };
};

export const TASK_FILTERS = [
  ["all", "All"],
  ["needs-you", "Needs you"],
  ["in-progress", "In progress"],
  ["completed", "Completed"],
] as const;
export function filteredTasks(tasks: TaskView[], filter = "all", query = "", dir = "") {
  const q = query.trim().toLocaleLowerCase();
  const rank = { "needs-you": 0, "in-progress": 1, completed: 2 };
  return tasks
    .filter(
      (t) =>
        (!dir || t.dir === dir) &&
        (filter === "all" || t.attention.category === filter) &&
        (!q ||
          [t.title, t.goal, t.projectName, t.attention.reason, t.attention.action]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase()
            .includes(q)),
    )
    .sort(
      (a, b) =>
        rank[a.attention.category] - rank[b.attention.category] ||
        Number(new Date(b.updatedAt ?? 0)) - Number(new Date(a.updatedAt ?? 0)) ||
        a.id.localeCompare(b.id),
    );
}
export const queuedInputs = (t: TaskView) =>
  (t.inputs ?? []).filter((i) => ["received", "queued", "dispatched"].includes(i.state));
export function canAcceptTask(t: TaskView, result?: TaskResult) {
  return (
    !!result &&
    t.actions?.accept !== false &&
    !t.queuePaused &&
    result.id === t.currentResultId &&
    !t.decision &&
    !t.activeRun &&
    !queuedInputs(t).length &&
    t.attention.category !== "completed"
  );
}
export const taskHref = (t: Pick<TaskView, "id" | "dir">) =>
  `?view=task&task=${encodeURIComponent(t.id)}&dir=${encodeURIComponent(t.dir || "")}`;
export const taskStatus = (t: TaskView) => t.attention?.reason || t.status || "Saved";
// The last path part of a project dir, without its .kaizen folder.
export const dirName = (dir: string) =>
  dir
    .replace(/[\\/]\.kaizen$/, "")
    .split(/[\\/]/)
    .pop() || "";
export const projectLabel = (t: TaskView, projects: TaskPageData["projects"] = []) =>
  t.projectName ||
  projects.find((p) => p.dir === t.dir)?.name ||
  projects.find((p) => p.dir === t.dir)?.label ||
  (t.dir ? dirName(t.dir) : "Choose a project");
// What the conversation shows: no boundary markers, no internal continuation prompt, only the newest result message.
export function visibleMessages(messages: TaskView["messages"] = []) {
  if (!messages?.length) return [];
  const clean = messages.filter((m) => {
    if (m.type === "boundary") return false;
    if (m.role === "user" && m.text.includes("Continue production under the frozen task policy")) return false;
    return true;
  });
  const last = clean.reduce((at, m, i) => (m.type === "result" ? i : at), -1);
  return clean.filter((m, i) => !(m.type === "result" && i !== last));
}
// Newest-created last; the page opens on the current result unless someone picked another.
export const sortedResults = (results: TaskResult[] = []) =>
  [...results].sort((a, b) => Number(new Date(a.createdAt ?? 0)) - Number(new Date(b.createdAt ?? 0)));
// Archive is always offered; Abandon only for a live run; Delete only before any run exists.
export const closeActions = (t: TaskView) =>
  t.actions ?? { abandon: !!t.activeRun, delete: !t.activeRun && !(t.runs ?? []).length };
export const runIdsOf = (t: TaskView) => [
  ...new Set([...(t.runs ?? []).map((r) => (typeof r === "string" ? r : r.id)), ...(t.activeRun ? [t.activeRun] : [])]),
];
