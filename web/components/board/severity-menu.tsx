import { SEVS, type Card } from "@lib/core";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@web/ui";
import { IconButton } from "@components/shared";

// The Backlog tab's severity filter: one severity, or all of them, each with how many items it holds.
export function SeverityMenu({
  value,
  items,
  onChange,
}: {
  value: string | null;
  items: Card[];
  onChange: (v: string | null) => void;
}) {
  const chosen = SEVS.find((x) => x[0] === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <IconButton
          icon="filter"
          label={chosen ? "Severity: " + chosen[1] : "Filter by severity"}
          aria-label="Filter by severity"
          className={`ml-auto size-(--btn-xs) [&_svg]:size-4 ${value ? "bg-primary/12 text-primary" : ""}`}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-[180px]">
        <DropdownMenuRadioGroup value={value ?? ""} onValueChange={(v) => onChange(v || null)}>
          <DropdownMenuRadioItem value="">
            All severities <i className="ml-auto text-xs not-italic text-muted-foreground">{items.length}</i>
          </DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          {SEVS.map(([v, l, f]) => (
            <DropdownMenuRadioItem key={v} value={v}>
              {l}{" "}
              <i className="ml-auto text-xs not-italic text-muted-foreground">
                {items.filter((c) => f(c.severity)).length}
              </i>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
