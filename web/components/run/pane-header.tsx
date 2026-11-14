import { run, useRunView } from "../../lib/run/index.ts";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, Icon } from "@web/ui";

// What a pane's header holds (the header element, its handle for dragging, belongs to the old code): the title, a menu
// that moves the pane into another tab or a tab of its own, and × that closes it.
export function PaneHeader({ id }: { id: string }) {
  const title = useRunView((s) => s.titles[id] ?? ""),
    // Filtered here, not in the selector: a selector that returned a new array each time would never settle.
    others = useRunView((s) => s.screens).filter((sc) => !sc.ids.includes(id));
  return (
    <>
      <span>{title}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Move to another tab"
            aria-label={`Move ${title}`}
            className="px-1 text-muted-foreground"
          >
            ⋯
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-50 text-sm">
          <DropdownMenuLabel>Move to</DropdownMenuLabel>
          {others.map((sc) => (
            <DropdownMenuItem key={sc.id} onSelect={() => run.act.move(id, sc.id)}>
              <Icon name="arrow" className="size-(--ico)" />
              <span>{sc.title}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={() => run.act.move(id, null)}>
            <Icon name="plus" className="size-(--ico)" />
            <span>New tab</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <button
        type="button"
        title="Close"
        aria-label={`Close ${title}`}
        onClick={() => run.act.closeItem(id)}
        className="px-1 text-muted-foreground"
      >
        ×
      </button>
    </>
  );
}
