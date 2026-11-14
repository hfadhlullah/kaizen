import { cn } from "../lib/utils.ts";
import { Toggle } from "../ui/toggle.tsx";

// A group of buttons of which exactly one is pressed (Cards | Sort, Link | Social): the pressed one is filled.
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
  idPrefix,
  labelledBy,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  idPrefix?: string; // each button gets the id `<idPrefix>-<option id>`
  labelledBy?: string; // the label that names the group, in place of `label`
}) {
  return (
    <div
      role="group"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      id={idPrefix}
      className={cn("inline-flex overflow-hidden rounded-sm border border-border bg-card", className)}
    >
      {options.map((o) => (
        <Toggle
          key={o.id}
          id={idPrefix ? `${idPrefix}-${o.id}` : undefined}
          pressed={value === o.id}
          onPressedChange={() => onChange(o.id)}
          className="h-7 px-3 text-sm text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          {o.label}
        </Toggle>
      ))}
    </div>
  );
}
