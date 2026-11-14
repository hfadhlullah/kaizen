import { useEffect, useState } from "react";
import { cn } from "../../lib/core/index.ts";

const bar: Record<string, string> = {
  running:
    "bg-running after:absolute after:inset-0 after:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent)] motion-safe:after:animate-[rsweep_1.6s_ease-in-out_infinite]",
  waiting: "bg-warning motion-safe:animate-[rpulse_1.8s_ease-in-out_infinite]",
  stalled: "bg-danger",
  done: "bg-success",
};
// The stage the run is in as one word, and a bar that slides to it. A new run's bar grows from empty; the same run's
// slides from where it was (the element stays, so the width change is the animation).
export function RunProgress({ word, w, status, tip }: { word: string; w: number; status: string; tip: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => setShown(w), [w]);
  return (
    <div title={tip} className="col-span-full mt-2 flex items-center gap-2.5 text-[11px] text-muted-foreground">
      <span className={cn("max-w-1/2 min-w-0 truncate", status === "waiting" && "text-warning")}>{word}</span>
      <b className="relative h-[3px] flex-1 overflow-hidden rounded-[2px] bg-border">
        <i
          style={{ width: shown + "%" }}
          className={cn(
            "absolute inset-y-0 left-0 rounded-[2px] bg-running transition-[width] duration-[600ms] ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none",
            bar[status],
          )}
        />
      </b>
    </div>
  );
}
