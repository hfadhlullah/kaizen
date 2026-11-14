import { useState } from "react";
import { host } from "../lib/host.ts";
import { ALL, isAction, showingCount, showingLabel, useProjectBar } from "../lib/project-bar.ts";
import { cn } from "../lib/utils.ts";
import { Button } from "../ui/button.tsx";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "../ui/command.tsx";
import { Icon } from "../ui/icon.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover.tsx";
import { Picker, type PickerOption } from "./picker.tsx";
import { ProjectMark } from "./project-mark.tsx";

// The mark in front of a choice: the board for All projects, a plus for an action, else the project's own mark.
const Mark = ({ value, label }: { value: string; label: string }) =>
  value === ALL ? (
    <Icon name="board" className="size-4 text-muted-foreground" />
  ) : isAction(value) ? (
    <Icon name="plus" className="size-4 text-muted-foreground" />
  ) : (
    <ProjectMark dir={value} label={label} />
  );

// The project the board is on: a searchable list (the board's own projects, then folders found in the projects folder,
// then New project, Find projects and Clone). Picking one switches the board in place.
export function ProjectPicker() {
  const rows = useProjectBar((s) => s.rows),
    dir = useProjectBar((s) => s.dir);
  const options: PickerOption[] = rows.map((r) => ({
    value: r.value,
    label: r.value === ALL || isAction(r.value) ? r.label : r.label.split(/[\\/]/).pop() || r.label,
    group: r.fresh ? "In your projects folder" : undefined,
    icon: <Mark value={r.value} label={r.label} />,
    search: r.label,
  }));
  return (
    <Picker
      label="project"
      value={dir || ALL}
      options={options}
      onChange={(v) => void host.pickProject(v)}
      className="border-transparent bg-transparent hover:border-border max-w-[260px]"
    />
  );
}

// In All projects: which projects show. A checklist that stays open while rows are toggled; Show all clears it.
export function ShowingPicker() {
  const all = useProjectBar((s) => s.showable),
    shown = useProjectBar((s) => s.shown);
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Projects shown"
          className="inline-flex h-(--btn-s) max-w-full items-center gap-2 rounded-sm border border-transparent bg-transparent px-2.5 text-base hover:border-border"
        >
          {showingLabel(shown, all)}
          <Icon name="chev" className="size-3 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-1.5">
        <Command>
          <CommandInput placeholder="Search projects…" aria-label="Search projects" />
          <CommandList className="max-h-80">
            <CommandEmpty>No match</CommandEmpty>
            {all.map((p) => {
              const on = shown.includes(p.dir);
              return (
                <CommandItem
                  key={p.dir}
                  value={p.dir}
                  keywords={[p.label]}
                  title={p.label}
                  role="menuitemcheckbox"
                  aria-checked={on}
                  onSelect={() => host.toggleShown(p.dir)}
                  className="gap-2.5 px-2.5"
                >
                  <ProjectMark dir={p.dir} label={p.label} size={18} />
                  <span className="min-w-0 flex-1 truncate">{p.label.split(/[\\/]/).pop() || p.label}</span>
                  <Icon name="check" className={cn("size-3.5 text-primary", !on && "invisible")} />
                </CommandItem>
              );
            })}
          </CommandList>
          <div className="mt-1.5 flex items-center justify-between border-t border-border px-1 pt-1.5 text-sm text-muted-foreground">
            <span>{showingCount(shown, all)}</span>
            <Button variant="ghost" size="sm" onClick={() => host.clearShown()}>
              Show all
            </Button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
