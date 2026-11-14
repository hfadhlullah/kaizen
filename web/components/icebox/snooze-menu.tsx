import { useRef, useState, type ReactElement } from "react";
import { ymd } from "../../lib/icebox/index.ts";
import { cn } from "../../lib/core/index.ts";
import { Button, Input, Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@web/ui";

const WHEN = [
  ["1d", "Tomorrow"],
  ["1w", "Next week"],
  ["1m", "Next month"],
] as const;
// "Snooze until": three quick days and a date; the request leaves the list until then. Arrow keys walk the rows.
export function SnoozeMenu({
  onPick,
  children,
  anchor,
  open: shown,
  onOpenChange,
}: {
  onPick: (until: string) => void;
  children?: ReactElement; // the button that opens it
  anchor?: ReactElement; // or the element it opens under, when something else opens it (a long press)
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [own, setOwn] = useState(false),
    open = shown ?? own,
    setOpen = (o: boolean) => (setOwn(o), onOpenChange?.(o)),
    [date, setDate] = useState(""),
    field = useRef<HTMLInputElement>(null),
    day = (n: number) => ymd(new Date(Date.now() + n * 864e5)),
    pick = (v: string) => {
      setOpen(false);
      onPick(v);
    };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {anchor ? <PopoverAnchor asChild>{anchor}</PopoverAnchor> : <PopoverTrigger asChild>{children}</PopoverTrigger>}
      <PopoverContent
        role="menu"
        aria-label="Snooze until"
        className="flex w-[220px] flex-col"
        onKeyDown={(e) => {
          const els = [...e.currentTarget.querySelectorAll<HTMLElement>("button,input")],
            at = els.indexOf(document.activeElement as HTMLElement);
          if (
            (e.key === "ArrowDown" || e.key === "ArrowUp") &&
            (document.activeElement as HTMLInputElement)?.type !== "date"
          ) {
            e.preventDefault();
            els[(at + (e.key === "ArrowDown" ? 1 : els.length - 1)) % els.length]?.focus();
          }
        }}
      >
        {WHEN.map(([v, l]) => (
          <button
            key={v}
            type="button"
            role="menuitem"
            onClick={() => pick(v)}
            className="rounded-sm px-2 py-1.5 text-left text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {l}
          </button>
        ))}
        <div className={cn("mt-1 flex gap-1.5 border-t border-border px-1 pt-1.5")}>
          <Input
            ref={field}
            type="date"
            aria-label="Snooze until"
            min={day(1)}
            max={day(365)}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-7 min-w-0 flex-1 text-sm"
          />
          <Button size="sm" onClick={() => (date ? pick(date) : field.current?.focus())}>
            Snooze
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
