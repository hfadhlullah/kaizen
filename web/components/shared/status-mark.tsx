import { cn } from "../../lib/core/index.ts";
import { Icon } from "@web/ui";

const tone: Record<string, string> = {
  idea: "text-muted-foreground",
  start: "text-running motion-safe:[&_svg]:animate-pulse",
  run: "text-running motion-safe:[&_svg]:animate-pulse",
  stall: "text-muted-foreground",
  wait: "text-warning",
  done: "text-success",
  aband: "text-muted-foreground",
};
// A run's or task's state as the board's 14px mark (idea, start, run, stall, wait, done, aband), coloured by what
// it means: waiting on you is amber, running is the run colour, done is green.
export function StatusMark({ name, title, className }: { name: string; title?: string; className?: string }) {
  return (
    <span
      role={title ? "img" : undefined}
      title={title}
      aria-label={title}
      className={cn("grid size-3.5 shrink-0 place-items-center", tone[name], className)}
    >
      <Icon sprite="s" name={name} className="size-3.5 stroke-[1.8]" />
    </span>
  );
}
