import { cn } from "@lib/core";
import { agentMark } from "@lib/phone";
import { Icon } from "@web/ui";

// An agent's own mark in a quiet circle. `live` turns a ring around it while that agent works; `dim` steps one that
// has handed over to the back.
export function AgentMark({
  agent,
  size = "md",
  live,
  dim,
  className,
}: {
  agent: string;
  size?: "sm" | "md";
  live?: boolean;
  dim?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative grid shrink-0 place-items-center rounded-full bg-muted transition-opacity",
        size === "sm" ? "size-5" : "size-6",
        dim && "opacity-45",
        live &&
          "before:absolute before:-inset-[3px] before:rounded-full before:border-[1.5px] before:border-success/25 after:absolute after:-inset-[3px] after:rounded-full after:border-[1.5px] after:border-transparent after:border-t-success motion-safe:after:animate-spin",
        className,
      )}
    >
      <Icon name={agentMark(agent)} className={size === "sm" ? "size-3" : "size-3.5"} />
    </span>
  );
}
