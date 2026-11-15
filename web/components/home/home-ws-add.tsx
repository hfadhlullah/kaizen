import { markOf, readHomeAgents, startHomeShell, useHomeWs } from "@lib/home";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
} from "@web/ui";
import { IconButton } from "@components/shared";

// The Home window's "+": a menu of the agents that can start in the Home folder, then Shell. It reads the agents when it opens.
export function HomeWsAdd() {
  const { agents, dflt } = useHomeWs();
  const row = (cmd: string, name: string, note: string, icon: string) => (
    <DropdownMenuItem
      key={cmd || "shell"}
      onSelect={() => void startHomeShell(cmd || undefined)}
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
    <DropdownMenu onOpenChange={(o) => o && void readHomeAgents()}>
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
