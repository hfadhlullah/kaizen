import type { Phases } from "@lib/run";
import { cn } from "@lib/core";

// The colour of the stage the run is in: running, waiting on you (amber), stalled (red).
const tone: Record<string, string> = { waiting: "[--c:var(--warn)]", stalled: "[--c:var(--danger)]" };
// Plan > Build > Review > Done as dots on a line: the stages before the run's are filled and joined in green, its own is
// ringed in the run's status colour, the rest wait.
export function PhaseSteps({ phases: { names, at, status, tip } }: { phases: Phases }) {
  return (
    <span
      title={tip}
      aria-label={tip}
      className={cn("inline-grid w-[210px] max-w-full grid-flow-col auto-cols-fr [--c:var(--run)]", tone[status])}
    >
      {names.map((n, i) => (
        <span
          key={n}
          className={cn(
            "relative flex flex-col items-center gap-[3px] text-[10px] leading-[1.2] text-muted-foreground",
            i > 0 && "before:absolute before:right-1/2 before:top-1 before:h-0.5 before:w-full before:bg-border",
            i > 0 && i - 1 < at && "before:bg-success",
            i === at && "font-semibold text-(--c)",
          )}
        >
          <i
            className={cn(
              "relative z-[1] size-2.5 rounded-full border-2 border-border bg-card",
              i < at && "border-success bg-success",
              i === at && "border-(--c) shadow-[0_0_0_3px_color-mix(in_srgb,var(--c)_25%,transparent)]",
            )}
          />
          {n}
        </span>
      ))}
    </span>
  );
}
