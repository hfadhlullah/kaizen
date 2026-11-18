// The thin progress bar of the task panel: the stage word, how far along, and what the colour says. Coarse on purpose:
// a task knows its stage (plan, build, review), not a percentage, so the bar moves in fixed steps and the word says why.
import type { TaskView } from "./tasks.ts";

export type TaskProgress = { word: string; pct: number; tone: "wait" | "run" | "ok" | "idle" };
const STEP: Record<string, number> = { explore: 15, plan: 30, build: 62, review: 85 };
const WORD: Record<string, string> = { explore: "Explore", plan: "Plan", build: "Build", review: "Review" };

export function taskProgress(t: TaskView): TaskProgress {
  const stage = t.runStage ?? "",
    pct = STEP[stage] ?? (t.currentResultId ? 85 : 0);
  if (t.attention?.category === "completed" || t.status === "accepted") return { word: "Done", pct: 100, tone: "ok" };
  if (t.decision?.kind === "question") return { word: "Question, needs you", pct, tone: "wait" };
  if (t.decision || t.pendingDecision) return { word: "Plan, needs you", pct: STEP.plan, tone: "wait" };
  if (t.status === "draft") return { word: "Not started", pct: 0, tone: "idle" };
  if (t.status === "working") return { word: WORD[stage] ?? "Working", pct: pct || 20, tone: "run" };
  if (["interrupted", "failed", "stopping"].includes(t.status ?? ""))
    return { word: (WORD[stage] ?? "Stopped") + (WORD[stage] ? ", stopped" : ""), pct, tone: "idle" };
  if (t.status === "ready" || t.currentResultId) return { word: "Ready for you", pct: 90, tone: "wait" };
  return { word: t.attention?.reason || "Working", pct: pct || 20, tone: "idle" };
}
