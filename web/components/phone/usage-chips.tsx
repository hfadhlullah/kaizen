import { useRef, useState, type FocusEvent, type PointerEvent } from "react";
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

// One agent's chip: its mark and 5-hour % (coloured as it fills), and a popover with the 5-hour and weekly windows. A
// tap opens it; with `hover` (the desktop footer) so does the pointer or focus, and it closes when both have left it, so
// the figures read like a tooltip without being one.
function UsageChip({ u, hover, side }: { u: Usage; hover?: boolean; side?: "top" | "bottom" }) {
  const head = u.five ?? u.week,
    lv = usageLevel(head?.pct ?? 0),
    [open, setOpen] = useState(false),
    timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hold = (on: boolean) => {
    clearTimeout(timer.current);
    if (on) setOpen(true);
    else timer.current = setTimeout(() => setOpen(false), 120);
  };
  const h = hover
    ? {
        onPointerEnter: (e: PointerEvent) => e.pointerType === "mouse" && hold(true),
        onPointerLeave: (e: PointerEvent) => e.pointerType === "mouse" && hold(false),
      }
    : {};
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`${NAME[u.agent]} usage`}
        className={cn("flex min-h-8 items-center gap-1.5 text-base", u.error && "opacity-75")}
        {...h}
        {...(hover
          ? {
              // Keyboard focus only: closing gives the focus back to the trigger, which must not open it again.
              onFocus: (e: FocusEvent) => e.currentTarget.matches(":focus-visible") && hold(true),
              onBlur: () => hold(false),
            }
          : {})}
      >
        <Icon name={u.agent} className="size-[15px]" />
        <b className={cn("font-medium", u.error ? "text-foreground" : tone[lv])}>
          {u.error ? "–" : head ? head.pct + "%" : ""}
        </b>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side={side}
        className="flex min-w-60 flex-col gap-2 p-3 text-sm"
        {...h}
        // A hover card must not take the keyboard from whatever the person is typing in.
        onOpenAutoFocus={hover ? (e) => e.preventDefault() : undefined}
        onCloseAutoFocus={hover ? (e) => e.preventDefault() : undefined}
      >
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
}
export const UsageChips = ({ list, hover, side }: { list: Usage[]; hover?: boolean; side?: "top" | "bottom" }) =>
  usageList(list).map((u) => <UsageChip key={u.agent} u={u} hover={hover} side={side} />);
