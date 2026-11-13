import { useState } from "react";
import { cn } from "../lib/utils.ts";

// One message: who and when above, the text in a bubble. A long message shows its first lines and "Show more".
export function ChatBubble({
  from,
  name,
  at,
  text,
}: {
  from: "user" | "agent";
  name: string;
  at?: number | string;
  text: string;
}) {
  const [open, setOpen] = useState(false);
  const long = text.length > 320 && !open;
  const user = from === "user";
  return (
    <article
      className={cn("flex max-w-[88%] flex-col gap-[3px]", user ? "items-end self-end" : "items-start self-start")}
    >
      <div className={cn("flex items-baseline gap-1.5 px-1 text-xs text-muted-foreground", user && "flex-row-reverse")}>
        <strong className="font-medium">{name}</strong>
        {at ? <time>{new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time> : null}
      </div>
      <div
        className={cn(
          "whitespace-pre-wrap break-words rounded-[14px] px-3 py-2 text-base leading-[1.45]",
          user ? "rounded-br-xs bg-foreground text-primary-foreground" : "rounded-bl-xs bg-muted",
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
