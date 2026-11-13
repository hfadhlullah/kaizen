import { Fragment, type ReactNode } from "react";
import { cn } from "../lib/utils.ts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu.tsx";
import { Icon } from "../ui/icon.tsx";
import { IconButton } from "./icon-button.tsx";

export type ActionItem = {
  id: string;
  label: string;
  danger?: boolean;
  href?: string;
  icon?: string; // leads the row (the board's sprite)
  before?: boolean; // a separator above this row
  count?: number; // trails the row
  onSelect?: () => void;
};
// A "…" menu: an icon button, optional information above, then actions. Selecting an action closes it; a
// refresh behind it never does, because nothing here is redrawn by hand.
export function ActionMenu({
  label,
  icon = "more",
  items,
  children,
  className,
  triggerClassName,
  size,
}: {
  label: string;
  icon?: string;
  items: ActionItem[];
  children?: ReactNode;
  className?: string;
  triggerClassName?: string;
  size?: "sm"; // the compact trigger a card carries
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          icon={icon}
          label={label}
          className={cn(size === "sm" && "size-(--btn-xs) [&_svg]:size-4", triggerClassName)}
          // A menu on a clickable card: pressing its trigger is not pressing the card.
          onClick={(e) => e.stopPropagation()}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className={cn("w-[340px] max-w-[80vw] text-sm", className)}
        // React events bubble through the portal to the card that owns the menu: its items are not presses on it.
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {children}
        {children && items.length > 0 && <DropdownMenuSeparator />}
        {items.map((it) =>
          it.href ? (
            <DropdownMenuItem key={it.id} asChild>
              <a href={it.href}>{it.label}</a>
            </DropdownMenuItem>
          ) : (
            <Fragment key={it.id}>
              {it.before && <DropdownMenuSeparator />}
              <DropdownMenuItem
                onSelect={it.onSelect}
                className={it.danger ? "text-danger data-[highlighted]:text-danger" : undefined}
              >
                {it.icon && <Icon name={it.icon} className="size-[15px] shrink-0" />}
                {it.label}
                {it.count != null && <i className="ml-auto text-xs not-italic text-muted-foreground">{it.count}</i>}
              </DropdownMenuItem>
            </Fragment>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
