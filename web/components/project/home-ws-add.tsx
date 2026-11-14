import { markOf, useHomeWsMenu } from "../../lib/project/index.ts";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Icon } from "@web/ui";
import { IconButton } from "../shared/index.ts";

// The Home window's "+": a menu of the agents that can start in the Home folder, then Shell.
export function HomeWsAdd() {
  const { agents, dflt, open, start } = useHomeWsMenu();
  const row = (cmd: string, name: string, note: string, icon: string) => (
    <DropdownMenuItem
      key={cmd || "shell"}
      onSelect={() => start(cmd || undefined)}
      className="items-start gap-2.5 px-2.5 py-1.5 text-foreground"
    >
      <Icon name={icon} className="mt-0.5 size-4" />
      <span className="flex flex-col">
        {name}
        <small className="text-xs text-muted-foreground">{note}</small>
      </span>
    </DropdownMenuItem>
  );
  return (
    <DropdownMenu onOpenChange={(o) => o && void open()}>
      <DropdownMenuTrigger asChild>
        <IconButton icon="plus" label="New tab" className="size-(--btn-xs) max-[640px]:size-10" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[250px]">
        {agents.map((a) =>
          row(
            a.cmd,
            a.name,
            a.cmd === dflt ? "default agent, in your Home folder" : "in your Home folder",
            markOf(a.cmd),
          ),
        )}
        {!!agents.length && <DropdownMenuSeparator />}
        {row("", "Shell", "a terminal in your Home folder", "term")}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
