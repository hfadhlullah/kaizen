// Which tab of the task page opens, and the mark on each, from the task's status. The page shows the tab that needs the
// person; a mark says why: amber waits on you, a ring is an agent working, green is finished.
import { canAcceptTask, type TaskView } from "./tasks.ts";
import type { TaskResult } from "./task-results.ts";

export type TabId = "plan" | "result" | "changes" | "review";
export type TabMark = "wait" | "run" | "ok" | null;
const PLANNING = ["plan", "explore"];

const waiting = (t: TaskView) => !!(t.decision || t.pendingDecision);
const planning = (t: TaskView) => t.status === "working" && PLANNING.includes(t.runStage ?? "") && !t.currentResultId;
// Plan while a decision waits, the task has not started, or the agent is still planning; Result from the build on.
export const tabFor = (t: TaskView): TabId => (waiting(t) || t.status === "draft" || planning(t) ? "plan" : "result");
export function tabMarks(t: TaskView, current?: TaskResult): Record<"plan" | "result", TabMark> {
  const done = t.attention?.category === "completed" || t.status === "accepted";
  return {
    plan: waiting(t) ? "wait" : planning(t) ? "run" : null,
    result:
      planning(t) || waiting(t)
        ? null
        : t.status === "working"
          ? "run"
          : done
            ? "ok"
            : canAcceptTask(t, current)
              ? "wait"
              : null,
  };
}
