import type { ReactNode } from "react";
import { cn } from "../lib/core/index.ts";
import { Badge } from "../ui/badge.tsx";

type Category = "needs-you" | "in-progress" | "completed";
const tone = { "needs-you": "warning", completed: "success", "in-progress": "neutral" } as const;
// A task's state as a dot or as its words, coloured by what it means: waiting on you is amber, done is green,
// anything else is quiet. `dot` draws only the 12px marker (waiting pulses, done has a tick, the rest is a ring).
export function StatusBadge({ category, dot, children }: { category: Category; dot?: boolean; children?: ReactNode }) {
  if (!dot) return <Badge tone={tone[category]}>{children}</Badge>;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative block size-3 shrink-0 rounded-full",
        category === "needs-you" &&
          "bg-warning after:absolute after:inset-0 after:rounded-full after:bg-warning after:content-[''] motion-safe:after:animate-ping",
        category === "completed" &&
          "bg-success after:absolute after:left-[4.2px] after:top-[2px] after:h-[5.5px] after:w-[2.5px] after:rotate-45 after:border-solid after:border-background after:border-b-[1.6px] after:border-r-[1.6px] after:content-['']",
        category === "in-progress" && "shadow-[inset_0_0_0_1.5px_var(--dim)]",
      )}
    />
  );
}
