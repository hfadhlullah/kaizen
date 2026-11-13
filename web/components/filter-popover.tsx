import { useState, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover.tsx";
import { IconButton } from "./icon-button.tsx";

// The funnel of a list: an icon button with a dot while a filter is on, opening a popup that holds the filters
// (chips in FilterMenu, pickers in the Icebox). `children` may take a function that closes the popup.
export function FilterPopover({
  label,
  active,
  children,
  className,
}: {
  label: string;
  active: boolean;
  children: ReactNode | ((close: () => void) => ReactNode);
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton icon="filter" label={label} active={active} />
      </PopoverTrigger>
      <PopoverContent className={className ?? "flex flex-col gap-1.5 p-2"}>
        {typeof children === "function" ? children(() => setOpen(false)) : children}
      </PopoverContent>
    </Popover>
  );
}
