import { useBoard, stripActions, stripChips, stripDot, type Chip } from "@lib/board";
import { cn } from "@lib/core";
import { Icon, Popover, PopoverContent, PopoverTrigger } from "@web/ui";

// A running mark pulses; every other status is the board's own mark.
function Mark({ icon }: { icon?: string }) {
  if (!icon) return null;
  return icon === "run" ? (
    <span className="grid size-3 place-items-center" aria-hidden="true">
      <span className="size-2 rounded-full bg-running motion-safe:animate-pulse" />
    </span>
  ) : (
    <Icon sprite="s" name={icon} className="size-3 stroke-[1.8]" />
  );
}
function Chips({ chips }: { chips: Chip[] }) {
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          title={c.title}
          aria-pressed={c.on}
          onClick={() => stripActions.pick(c.id)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-muted-foreground shadow-[inset_0_0_0_1px_var(--line)] transition-colors hover:bg-muted hover:text-foreground",
            c.attn &&
              "bg-warning/18 text-foreground shadow-[inset_0_0_0_1px_var(--warn)] hover:bg-warning/30 [&_svg]:text-warning",
            c.on && "bg-muted text-foreground",
            c.on && c.attn && "bg-warning/30",
          )}
        >
          <Mark icon={c.icon} />
          {c.label}
        </button>
      ))}
    </span>
  );
}

// The board's status filter under the cards: one chip per status with its count; a click shows only that status, a
// second click shows all. On a phone the bar is hidden and the same chips open from the header's button (StatusButton).
export function StatusStrip() {
  const snap = useBoard((s) => s.snap);
  return snap && snap.mode !== "ws" ? <Chips chips={stripChips(snap)} /> : null;
}

// The phone's status button in the header: the chips open in a popover under it. An amber dot says a run waits, an
// accent one that a filter or the archive is on. It is the board's own `.ib`, docked (kz-keep) like the search box.
export function StatusButton() {
  const snap = useBoard((s) => s.snap);
  if (!snap || snap.mode === "ws") return null;
  const dot = stripDot(snap);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          id="fbtn"
          className={cn("ib kz-keep", dot)}
          aria-label="Filter by status"
          title="Filter by status"
        >
          <svg>
            <use href="#i-filter" />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-w-[calc(100vw-24px)] p-3">
        <Chips chips={stripChips(snap)} />
      </PopoverContent>
    </Popover>
  );
}
