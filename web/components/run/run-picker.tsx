import { run, useRunView, type RvRun } from "@lib/run";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, Icon } from "@web/ui";
import { cn } from "@lib/core";
import { StateDot } from "@components/shared";

// The picker at the top of the workspace's run panel: the run shown, a dot when another run needs you, and a menu of the
// runs not over (waiting on you first), then History. A pick shows that run in the panel; the centre stays as it is.
export function RunPicker() {
  const p = useRunView((s) => s.picker);
  if (!p) return null;
  const item = (r: RvRun) => (
    <DropdownMenuItem
      key={r.k}
      onSelect={() => run.act.pick(r.k)}
      aria-current={r.k === p.cur.k || undefined}
      className={cn("min-h-[30px] gap-2 text-sm max-[640px]:min-h-11", r.k === p.cur.k && "bg-muted text-foreground")}
    >
      <StateDot state={r.state} />
      <b className="min-w-0 flex-1 truncate font-medium text-foreground">{r.title}</b>
      <small className="shrink-0 text-xs text-muted-foreground">{r.line}</small>
    </DropdownMenuItem>
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Choose a run"
          className="-ml-2 flex min-h-[30px] w-full items-center gap-2 rounded-sm px-2 text-foreground hover:bg-muted max-[640px]:min-h-11 [&[aria-expanded=true]_svg:last-child]:rotate-180"
        >
          <StateDot state={p.cur.state} />
          <b className="min-w-0 flex-1 truncate text-sm font-medium leading-[1.4]">{p.cur.title}</b>
          {p.other && <i title="Another run needs you" className="size-[7px] shrink-0 rounded-full bg-warning" />}
          <Icon name="chev" className="size-3 shrink-0 text-muted-foreground transition-transform" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[min(60vh,420px)] w-(--radix-dropdown-menu-trigger-width) min-w-[260px] overflow-y-auto"
      >
        {p.live.map(item)}
        {p.hist.length > 0 && (
          <>
            <DropdownMenuLabel className="pt-2 text-xs">History</DropdownMenuLabel>
            {p.hist.map(item)}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
