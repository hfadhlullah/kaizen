import { useState } from "react";
import { cn } from "../lib/utils.ts";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "../ui/command.tsx";
import { Icon } from "../ui/icon.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover.tsx";

export type PickerOption = { value: string; label: string };
// A searchable choice (project, source, category, agent): a button showing the choice that opens a list with a
// search box.
export function Picker({
  options,
  value,
  onChange,
  placeholder = "Choose",
  label,
  className,
}: {
  options: PickerOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const chosen = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "inline-flex h-(--btn-s) max-w-full items-center justify-between gap-2 rounded-sm border border-border bg-card px-2.5 text-base hover:border-muted-foreground",
            !chosen && "text-muted-foreground",
            className,
          )}
        >
          <span className="min-w-0 truncate">{chosen?.label ?? placeholder}</span>
          <Icon name="chev" className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px]">
        <Command>
          <CommandInput placeholder="Search…" aria-label={`Search ${label}`} />
          <CommandList>
            <CommandEmpty>Nothing matches</CommandEmpty>
            {options.map((o) => (
              <CommandItem
                key={o.value}
                value={o.label}
                onSelect={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {o.value === value && <Icon name="check" className="size-3.5 text-primary" />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
