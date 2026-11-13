import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover.tsx";
import { Chip } from "./chip.tsx";
import { IconButton } from "./icon-button.tsx";

export type FilterOption = { id: string; label: string; count?: number };
// The filter popup of a list: an icon button that opens one row of chips, one chosen. Choosing closes it. The
// button shows a dot while anything but the first option ("all") is chosen.
export function FilterMenu({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: FilterOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconButton icon="filter" label={label} active={value !== options[0]?.id} />
      </PopoverTrigger>
      <PopoverContent className="flex flex-col gap-1.5 p-2">
        <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
          {options.map((o) => (
            <Chip
              key={o.id}
              count={o.count}
              pressed={value === o.id}
              onPressedChange={() => {
                onChange(o.id);
                setOpen(false);
              }}
            >
              {o.label}
            </Chip>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
