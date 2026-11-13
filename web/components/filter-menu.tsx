import { Chip } from "./chip.tsx";
import { FilterPopover } from "./filter-popover.tsx";

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
  return (
    <FilterPopover label={label} active={value !== options[0]?.id}>
      {(close) => (
        <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
          {options.map((o) => (
            <Chip
              key={o.id}
              count={o.count}
              pressed={value === o.id}
              onPressedChange={() => {
                onChange(o.id);
                close();
              }}
            >
              {o.label}
            </Chip>
          ))}
        </div>
      )}
    </FilterPopover>
  );
}
