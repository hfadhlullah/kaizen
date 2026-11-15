import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@web/ui";

// Done's "Clear ▾": archive what is older than a week or three days, everything, or pick which.
export function ClearMenu({
  counts,
  onClear,
  onPick,
}: {
  counts: [number, number, number];
  onClear: (days: number) => void;
  onPick: () => void;
}) {
  const row = (label: string, n: number, days: number) => (
    <DropdownMenuItem onSelect={() => onClear(days)} className="text-foreground">
      {label} <i className="ml-auto text-xs not-italic text-muted-foreground">{n}</i>
    </DropdownMenuItem>
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="ml-auto min-h-[22px] px-2" title="Archive finished runs">
          Clear ▾
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-[200px]">
        {row("Older than a week", counts[0], 7)}
        {row("Older than 3 days", counts[1], 3)}
        {row("Everything", counts[2], 0)}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onPick} className="text-foreground">
          Pick which…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
