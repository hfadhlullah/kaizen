import { run, useRunView } from "@lib/run";
import { IconButton } from "@components/shared";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger, Icon } from "@web/ui";

// What a pane's header holds (the header element, its handle for dragging, is pane.tsx's): the title, a menu that moves
// the pane into another tab or a tab of its own, and × that closes it.
export function PaneHeader({ id }: { id: string }) {
  const title = useRunView((s) => s.titles[id] ?? ""),
    // Filtered here, not in the selector: a selector that returned a new array each time would never settle.
    others = useRunView((s) => s.screens).filter((sc) => !sc.ids.includes(id));
  return (
    <>
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton size="sm" icon="more" label="Move to another tab" aria-label={`Move ${title}`} />
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
      <IconButton size="sm" icon="x" label="Close" aria-label={`Close ${title}`} onClick={() => run.act.closeItem(id)} />
    </>
  );
}
