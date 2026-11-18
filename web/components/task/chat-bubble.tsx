import { useState } from "react";
import { cn } from "@lib/core";
import { AgentMark } from "./agent-mark.tsx";

// One message: who and when above, the text in a bubble. An agent's message carries its agent's mark and name. A long
// message shows its first lines and "Show more".
export function ChatBubble({
  from,
  name,
  at,
  text,
  agent,
}: {
  from: "user" | "agent";
  name: string;
  at?: number | string;
  text: string;
  agent?: string;
}) {
  const [open, setOpen] = useState(false);
  const long = text.length > 320 && !open;
  const user = from === "user";
  return (
    <article
      className={cn("flex max-w-[88%] flex-col gap-[3px]", user ? "items-end self-end" : "items-start self-start")}
    >
      <div className={cn("flex items-center gap-1.5 px-1 text-xs text-muted-foreground", user && "flex-row-reverse")}>
        {agent && <AgentMark agent={agent} size="sm" className="size-4 bg-transparent [&_svg]:size-3" />}
        <strong className="font-medium">{name}</strong>
        {at ? <time>{new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time> : null}
      </div>
      <div
        className={cn(
          "whitespace-pre-wrap break-words rounded-[14px] px-3 py-2 text-base leading-[1.45]",
          user ? "rounded-br-xs bg-muted" : "rounded-bl-xs border border-border bg-card",
        )}
      >
        {long ? (
          <button type="button" className="block text-left" onClick={() => setOpen(true)}>
            {text.slice(0, 280).trimEnd()}… <span className="whitespace-nowrap text-sm opacity-65">Show more</span>
          </button>
        ) : (
          text
        )}
      </div>
    </article>
  );
}
