import type { ReactNode, RefObject } from "react";
import { cn } from "@lib/core";
import { agentName, type ConversationItem, type TaskAgent, type TaskView } from "@lib/task";
import { IconButton } from "@components/shared";
import { AgentChip } from "./agent-chip.tsx";
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
// The desktop conversation: the agent chip with Resume or Stop beside it and the collapse button, the thread, and the
// message box at the foot. `controls` are those buttons, drawn by the page that owns the actions.
export function Conversation({
  agents,
  stage,
  controls,
  onCollapse,
  threadRef,
  body,
  footer,
}: {
  agents: TaskAgent[];
  stage?: string;
  controls?: ReactNode;
  onCollapse: () => void;
  threadRef: RefObject<HTMLDivElement | null>;
  body: ReactNode;
  footer: ReactNode;
}) {
  return (
    <>
      <header className="flex min-h-10 min-w-[340px] flex-none items-center gap-2 max-md:min-w-0">
        <h2 className="mr-auto text-base font-semibold text-strong">
          {agents.length ? <AgentChip agents={agents} stage={stage} /> : "Conversation"}
        </h2>
        {controls}
        <IconButton icon="side" label="Collapse the conversation" onClick={onCollapse} />
      </header>
      <div
        ref={threadRef}
        className="min-h-0 min-w-[340px] flex-1 overflow-auto max-md:min-w-0 [scrollbar-gutter:stable]"
      >
        {body}
      </div>
      <div className="min-w-[340px] flex-none pb-1 max-md:min-w-0">{footer}</div>
    </>
  );
}
// What is left of the conversation when it is collapsed: the same button, and the agents on the task under it. Pressing
// either opens it again. An amber dot says something waits there. A div, not an aside: the board's old CSS pins every aside.
export function ConversationRail({ agents, dot, onOpen }: { agents: TaskAgent[]; dot?: boolean; onOpen: () => void }) {
  return (
    <div
      role="complementary"
      aria-label="Conversation, collapsed"
      className="flex w-12 flex-none flex-col items-center gap-3.5 border-l border-border py-2.5"
    >
      <IconButton icon="side" label="Expand the conversation" aria-expanded={false} onClick={onOpen}>
        {dot && (
          <i className="absolute right-[5px] top-[5px] size-2 rounded-full bg-warning shadow-[0_0_0_2px_var(--bg)]" />
        )}
      </IconButton>
      {!!agents.length && (
        <button type="button" aria-label="Open the conversation" onClick={onOpen} className="flex flex-col gap-2">
          {agents.slice(0, 3).map((a) => (
            <AgentMark key={a.agent} agent={a.agent} live={a.state === "working"} />
          ))}
        </button>
      )}
    </div>
  );
}
