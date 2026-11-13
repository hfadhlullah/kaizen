import type { ReactNode } from "react";
import { cn } from "../lib/utils.ts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu.tsx";
import { IconButton } from "./icon-button.tsx";

export type ActionItem = { id: string; label: string; danger?: boolean; href?: string; onSelect?: () => void };
// A "…" menu: an icon button, optional information above, then actions. Selecting an action closes it; a
// refresh behind it never does, because nothing here is redrawn by hand.
export function ActionMenu({
  label,
  icon = "more",
  items,
  children,
  className,
}: {
  label: string;
  icon?: string;
  items: ActionItem[];
  children?: ReactNode;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton icon={icon} label={label} />
      </DropdownMenuTrigger>
      <DropdownMenuContent className={cn("w-[340px] max-w-[80vw] text-sm", className)}>
        {children}
        {children && items.length > 0 && <DropdownMenuSeparator />}
        {items.map((it) =>
          it.href ? (
            <DropdownMenuItem key={it.id} asChild>
              <a href={it.href}>{it.label}</a>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              key={it.id}
              onSelect={it.onSelect}
              className={it.danger ? "text-danger data-[highlighted]:text-danger" : undefined}
            >
              {it.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
