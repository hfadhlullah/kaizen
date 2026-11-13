// What a run's card, its panel and the task page ask the server to do, one function each, so two places showing the
// same button share one code path. Routes and payloads are the old board's, unchanged.
import { post } from "./api.ts";
import { cardKey, type Card } from "./board.ts";
import { host } from "./host.ts";
import { toast } from "./toast.ts";

export const where = (r: { pty?: unknown }) => (r.pty ? "running in its workspace" : "opened in your terminal");
const via = (r: { agent: { name: string; note?: string } }) => host.agentLine(r.agent);

// A run whose in-card agent ended, or one stalled with no progress, can get its agent back (its conversation, where
// the tool can resume one), in its card.
export const resumable = (c: Card) => c.status === "stalled" || !!(c.pty && !c.pty.alive);
export async function resumeRun(c: Card) {
  host.notify();
  const r = await post("/resume", { dir: c.state, id: c.id });
  if (!r.ok) return false;
  toast("Resumed, " + where(r) + ": " + via(r as any));
  if (r.pty) host.launched(c, r.pty);
  if (host.panelOpenFor(c)) host.reopenPanel(c);
  return true;
}
export async function archiveCard(c: Card, archived: boolean) {
  const r = await post(
    "/archive",
    c.kind === "idea" ? { dir: c.state, text: c.text, archived } : { dir: c.state, id: c.id, archived },
  );
  if (r.ok) toast(archived ? "Archived" : "Restored");
  host.closePanel();
  void host.loadBoard();
}
export async function backToTask(c: Card) {
  const r = await post("/to-task", { dir: c.state, id: c.id });
  if (r.ok) toast("Back in Tasks");
  void host.loadBoard();
}

// ---- approvals: a waiting run's decision, from its card, its panel footer or the agent's terminal
export const APPROVAL: Record<string, string> = {
  explore: "Explore brief ready.",
  "approvals.plan": "Plan ready.",
  "approvals.review": "Ready to check.",
  findings: "Open findings.",
};
// Answered approvals are remembered outside any form, so a second press cannot open a second agent. Keyed by when the
// run last moved: the same approval reached again after a revise is a new question.
export const decided = new Set<string>();
export const answerKey = (c: Card) => cardKey(c) + ":" + c.awaiting + ":" + c.moved;
// Approve (no `why`), or send back with a comment; `answers` are a plan's answered questions.
export async function decideRun(c: Card, why?: string, answers?: string[]) {
  host.notify();
  const r = await post("/decide", {
    dir: c.state,
    id: c.id,
    awaiting: c.awaiting,
    ...(why === undefined ? {} : { why }),
    ...(answers ? { answers } : {}),
  });
  // A failed send keeps the footer, and with it a typed comment.
  if (!r.ok) return false;
  decided.add(answerKey(c));
  toast(
    (why === undefined ? "Approved" : "Sent back") +
      ", " +
      (r.task
        ? "sent to the task's agent"
        : r.reused
          ? "sent to the agent already open in its workspace"
          : where(r) + ": " + via(r as any)),
  );
  if (r.pty) host.launched(c, r.pty);
  if (host.panelOpenFor(c)) host.reopenPanel(c);
  return true;
}
// "Approved" for a run whose agent finished without waiting for the user (healed, or done and not approved).
export async function acceptRun(c: Card) {
  const r = await post("/accept", { dir: c.state, id: c.id });
  if (r.ok) toast("Approved");
  return !!r.ok;
}
export async function skipExplore(c: Card) {
  const r = await post("/explore/skip", { dir: c.state, id: c.id });
  if (r.ok) toast("Skip Explore sent to the agent");
  return !!r.ok;
}
// A task's own action, sent from its run's panel: the same /task request the task page sends.
const taskPost = (c: Card, body: Record<string, unknown>) =>
  post("/task", {
    dir: c.task!.dir,
    id: c.task!.id,
    revision: c.task!.revision,
    operationId: crypto.randomUUID(),
    ...body,
  });
export async function acceptTask(c: Card) {
  const r = await taskPost(c, { op: "accept", resultId: c.task!.result });
  if (r.ok) toast("Accepted");
  return !!r.ok;
}
export async function answerTask(c: Card, text: string) {
  const r = await taskPost(c, { op: "message", text });
  if (r.ok) toast("Answer sent");
  return !!r.ok;
}
// Fix the ticked findings of a run's review, in the agent already open on it or a new one.
export async function fixFindings(c: Card, nums: number[]) {
  host.notify();
  const r = await post("/fix", { dir: c.state, id: c.id, nums });
  if (!r.ok) return false;
  toast(
    "Fixing " +
      nums.length +
      " finding" +
      (nums.length === 1 ? "" : "s") +
      ", " +
      (r.reused ? "sent to the agent already open in its workspace" : where(r) + ": " + via(r as any)),
  );
  if (r.pty) host.launched(c, r.pty);
  host.reopenPanel(c);
  return true;
}
