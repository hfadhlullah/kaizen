import { useState, type ReactNode } from "react";
import { cn } from "@lib/core";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, Icon, Popover, PopoverContent, PopoverTrigger } from "@web/ui";

// `group` heads a run of rows (sources under their platform); `icon` leads the row and the button; `count` trails it;
// `removable` puts a remove button on the row, which calls the Picker's `onRemove`.
export type PickerOption = {
  value: string;
  label: string;
  group?: string;
  icon?: ReactNode;
  count?: number;
  search?: string;
  removable?: boolean;
};
// A searchable choice (project, source, category, agent): a button showing the choice that opens a list with a
// search box. The search matches a row's words and its group's; Enter picks the first row left.
export function Picker({
  options,
  value,
  onChange,
  placeholder = "Choose",
  label,
  className,
  groupIcons,
  open: openProp,
  onOpenChange,
  onRemove,
}: {
  options: PickerOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
  className?: string;
  groupIcons?: Record<string, ReactNode>;
  // Opened from outside (a form that needs a choice before it can send).
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  onRemove?: (v: string) => void;
}) {
  const [own, setOwn] = useState(false),
    open = openProp ?? own,
    setOpen = (o: boolean) => (setOwn(o), onOpenChange?.(o));
  const chosen = options.find((o) => o.value === value);
  const row = (o: PickerOption) => (
    <CommandItem
      key={o.value}
      // cmdk highlights no row with an empty value (the Inbox collection, the "All" choices) and trims whitespace, so two
      // rows can look alike: the value is the row's place in the list, then its value.
      value={`${options.indexOf(o)}:${o.value}`}
      keywords={[o.label, o.group ?? "", o.search ?? ""]}
      onSelect={() => {
        onChange(o.value);
        setOpen(false);
      }}
    >
      {o.icon}
      <span className="min-w-0 flex-1 truncate">{o.label}</span>
      {o.count != null && <i className="text-xs not-italic tabular-nums text-muted-foreground">{o.count}</i>}
      {o.value === value && <Icon name="check" className="size-3.5 text-primary" />}
      {o.removable && onRemove && (
        <button
          type="button"
          aria-label={`Remove ${o.label}`}
          title={`Remove ${o.label}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
            onRemove(o.value);
          }}
          className="-mr-1 grid size-5 place-items-center rounded-xs text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground hover:opacity-100"
        >
          <Icon name="x" className="size-3" />
        </button>
      )}
    </CommandItem>
  );
  const groups = [...new Set(options.map((o) => o.group).filter((g): g is string => !!g))];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={chosen ? `${label}: ${chosen.label}` : label}
          className={cn(
            "inline-flex h-(--btn-s) max-w-full items-center justify-between gap-2 rounded-sm border border-border bg-card px-2.5 text-base hover:border-muted-foreground",
            !chosen && "text-muted-foreground",
            className,
          )}
        >
          {chosen?.icon}
          <span className="min-w-0 truncate">{chosen?.label ?? placeholder}</span>
          <Icon name="chev" className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px]">
        <Command
          filter={(_v, search, kw) => (kw?.join(" ").toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0)}
        >
          <CommandInput placeholder="Search…" aria-label={`Search ${label}`} />
          <CommandList>
            <CommandEmpty>Nothing matches</CommandEmpty>
            {options.filter((o) => !o.group).map(row)}
            {groups.map((g) => (
              <CommandGroup
                key={g}
                heading={
                  groupIcons?.[g] ? (
                    <>
                      {groupIcons[g]}
                      {g}
                    </>
                  ) : (
                    g
                  )
                }
              >
                {options.filter((o) => o.group === g).map(row)}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
