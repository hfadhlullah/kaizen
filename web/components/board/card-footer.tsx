import type { Chip, Mark } from "@lib/core";
import { cn } from "@lib/core";
import { Icon } from "@web/ui";

const chipTone = {
  "": "text-muted-foreground",
  link: "border-primary/40 text-primary",
  warn: "text-foreground",
  proj: "max-w-full truncate border-transparent bg-muted text-foreground",
};
const markTone = {
  "": "",
  accent: "text-primary",
  ok: "text-success",
  warn: "text-warning",
  run: "text-running",
  bad: "font-semibold text-danger",
  ask: "text-warning motion-safe:animate-pulse",
};
// The foot of a card: words on the left (project, what it needs), icon-only marks on the right.
export function CardFooter({ chips, marks }: { chips: Chip[]; marks: Mark[] }) {
  return (
    <div className="mt-0.5 flex items-center gap-2">
      <span className="flex min-w-0 flex-1 flex-wrap gap-1">
        {chips.map((c, i) => (
          <span
            key={i}
            title={c.title}
            className={cn(
              "inline-flex min-h-5 items-center gap-1.5 rounded-full border border-border px-2 py-px text-xs font-medium [overflow-wrap:anywhere]",
              chipTone[c.cls ?? ""],
            )}
          >
            {c.dot && (
              <i
                className={cn("size-1.5 rounded-full bg-muted-foreground not-italic", c.cls === "warn" && "bg-warning")}
              />
            )}
            {c.text}
          </span>
        ))}
      </span>
      <span className="ml-auto flex items-center gap-1.5 text-muted-foreground">
        {marks.map((m, i) => (
          <span
            key={i}
            role="img"
            title={m.title}
            aria-label={m.title}
            className={cn("grid place-items-center text-xs font-medium", markTone[m.cls])}
          >
            {m.icon ? <Icon name={m.icon} sprite={m.sprite ?? "i"} className="size-[13px] stroke-[1.7]" /> : m.text}
          </span>
        ))}
      </span>
    </div>
  );
}
