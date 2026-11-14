import { closeWsMenu, useWsMenu } from "../../lib/project/index.ts";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../ui/dropdown-menu.tsx";

// A menu where the pointer was: the trigger is a point, so the menu opens at the click like a context menu.
export function WsMenu() {
  const at = useWsMenu((s) => s.at);
  return (
    <DropdownMenu open={!!at} onOpenChange={(o) => !o && closeWsMenu()}>
      <DropdownMenuTrigger asChild>
        <span aria-hidden className="pointer-events-none fixed size-0" style={{ left: at?.x ?? 0, top: at?.y ?? 0 }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={0} className="min-w-[170px]">
        {at?.items.map((i) => (
          <DropdownMenuItem key={i.label} onSelect={i.run}>
            {i.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
