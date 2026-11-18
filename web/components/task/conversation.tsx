import { cn } from "@lib/core";
import { agentName, type ConversationItem } from "@lib/task";
import { AgentMark } from "./agent-mark.tsx";
import { ChatBubble } from "./chat-bubble.tsx";
import { TypingDots } from "./typing-dots.tsx";

// One quiet line between messages: the plan waiting, a stop, an approval, a warning.
function Line({ text, tone }: { text: string; tone?: "wait" | "warn" }) {
  return (
    <div
      role="separator"
      className={cn(
        "flex items-center gap-2 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border",
        tone === "wait" && "text-warning",
        tone === "warn" && "text-warning",
      )}
    >
      <span className="max-w-[80%] text-center">{text}</span>
    </div>
  );
}
// Where one agent hands over to another.
function Handoff({ item }: { item: Extract<ConversationItem, { kind: "handoff" }> }) {
  return (
    <div
      role="separator"
      className="flex items-center gap-2 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border"
    >
      <AgentMark agent={item.fromAgent} size="sm" />
      <span aria-hidden="true">→</span>
      <AgentMark agent={item.toAgent} size="sm" />
      <span>Handed to {item.to}</span>
    </div>
  );
}
// The messages, the quiet lines and the handoffs, in order. Shared by the desktop panel and the phone's page.
export function Thread({ items, working }: { items: ConversationItem[]; working?: boolean }) {
  return (
    <div
      role="log"
      aria-label="Task conversation"
      aria-live="polite"
      aria-relevant="additions"
      className="flex flex-col gap-3 pb-2 pt-1"
    >
      {items.map((i) =>
        i.kind === "message" ? (
          <ChatBubble
            key={i.m.id}
            from={i.user ? "user" : "agent"}
            name={i.user ? "You" : i.m.role === "system" ? "kaizen" : i.agent ? agentName(i.agent) : "Assistant"}
            at={i.m.at}
            text={i.m.text}
            agent={i.user ? undefined : i.agent}
          />
        ) : i.kind === "line" ? (
          <Line key={i.id} text={i.text} tone={i.tone} />
        ) : (
          <Handoff key={i.id} item={i} />
        ),
      )}
      {working && <TypingDots />}
    </div>
  );
}
