// What the conversation draws, from the task's raw events: the plain messages, the lines that stand for an event
// (the plan waiting, a stop, an approval), and where one agent hands over to another.
import { agentName, cleanRequest, visibleMessages, type TaskMessage, type TaskView } from "./tasks.ts";

export type ConversationItem =
  | { kind: "message"; m: TaskMessage; user: boolean; agent?: string }
  | { kind: "line"; id: string; text: string; at?: number | string; tone?: "wait" | "warn" }
  | { kind: "handoff"; id: string; from: string; to: string; fromAgent: string; toAgent: string };

// A stop is two events (asked, then done): one line says it. These system events are a quiet line, not a bubble.
const QUIET: Record<string, string> = {
  stop: "Stopping the agent…",
  stopped: "Agent stopped · edits kept",
  resume: "Resumed",
  finished: "The run finished",
  confirm: "You approved the plan",
};
export function conversationItems(t: Pick<TaskView, "messages" | "decision" | "pendingDecision">): ConversationItem[] {
  // Only a waiting plan has its line; a question that waits after an approved plan is the question itself.
  const kind = (t.decision ?? (t.pendingDecision as { kind?: string } | null | undefined))?.kind;
  const out: ConversationItem[] = [],
    all = visibleMessages(t.messages),
    waiting = kind === "proposal",
    // Only the newest proposal can be the one still waiting; an answered one leaves the conversation.
    lastProposal = all.reduce((at, m, i) => (m.type === "proposal" ? i : at), -1);
  let last = "";
  all.forEach((m, i) => {
    if (m.type === "proposal") {
      if (waiting && i === lastProposal)
        out.push({ kind: "line", id: m.id, text: "Plan ready · needs your approval", at: m.at, tone: "wait" });
      return;
    }
    if (m.role === "user" && m.type !== "confirm")
      return void out.push({ kind: "message", m: { ...m, text: cleanRequest(m.text) || m.text }, user: true });
    const quiet = QUIET[m.type ?? ""];
    if (quiet && m.role !== "assistant") {
      const prev = out[out.length - 1];
      // "stop" then "stopped": the second says it all.
      if (m.type === "stopped" && prev?.kind === "line" && prev.text === QUIET.stop) out.pop();
      return void out.push({ kind: "line", id: m.id, text: quiet, at: m.at });
    }
    if (m.role === "system") return void out.push({ kind: "line", id: m.id, text: m.text, at: m.at, tone: "warn" });
    if (m.agent && last && m.agent !== last)
      out.push({
        kind: "handoff",
        id: "h-" + m.id,
        from: agentName(last),
        to: agentName(m.agent),
        fromAgent: last,
        toAgent: m.agent,
      });
    if (m.agent) last = m.agent;
    out.push({ kind: "message", m, user: false, agent: m.agent });
  });
  return out;
}
