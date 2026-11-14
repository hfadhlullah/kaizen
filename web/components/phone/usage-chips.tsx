import { NAME, resets, usageLevel, usageList, type Usage } from "@lib/phone";
import { cn } from "@lib/core";
import { Icon, Popover, PopoverContent, PopoverTrigger } from "@web/ui";

const tone = { hi: "text-danger", mid: "text-warning", "": "text-foreground" };
const fill = { hi: "bg-danger", mid: "bg-warning", "": "bg-success" };

function Window({ label, w }: { label: string; w?: { pct: number; resetsAt?: number } }) {
  if (!w) return null;
  const lv = usageLevel(w.pct);
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-2.5 gap-y-1">
      <span className="text-muted-foreground">{label}</span>
      <b className={cn("font-medium", lv && tone[lv])}>{w.pct}%</b>
      <i className="col-span-full h-1 overflow-hidden rounded-xs bg-border">
        <i className={cn("block h-full", fill[lv])} style={{ width: Math.min(100, w.pct) + "%" }} />
      </i>
      <small className="col-span-full text-xs text-muted-foreground">resets {resets(w.resetsAt)}</small>
    </div>
  );
}

// The agent's mark and its 5-hour % (coloured as it fills); a tap shows the 5-hour and weekly windows.
export function UsageChips({ list }: { list: Usage[] }) {
  return usageList(list).map((u) => {
    const head = u.five ?? u.week,
      lv = usageLevel(head?.pct ?? 0);
    return (
      <Popover key={u.agent}>
        <PopoverTrigger
          aria-label={`${NAME[u.agent]} usage`}
          className={cn("flex min-h-8 items-center gap-1.5 text-base", u.error && "opacity-75")}
        >
          <Icon name={u.agent} className="size-[15px]" />
          <b className={cn("font-medium", u.error ? "text-foreground" : tone[lv])}>
            {u.error ? "–" : head ? head.pct + "%" : ""}
          </b>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex min-w-60 flex-col gap-2 p-3 text-sm">
          <b className="font-semibold">{NAME[u.agent]}</b>
          {u.error ? (
            <span className="text-muted-foreground">Usage unavailable: {u.error}</span>
          ) : (
            <>
              <Window label="5-hour window" w={u.five} />
              <Window label="Week" w={u.week} />
            </>
          )}
        </PopoverContent>
      </Popover>
    );
  });
}
