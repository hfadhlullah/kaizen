import type { ComponentProps } from "react";
import { cn } from "../lib/core/index.ts";
import { Toggle } from "../ui/toggle.tsx";

// A filter or kind chip (.ice-chip): 26px pill with an optional count; pressed is the filled one.
export function Chip({ count, className, children, ...props }: { count?: number } & ComponentProps<typeof Toggle>) {
  return (
    <Toggle
      className={cn(
        "inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-sm border border-border bg-card px-2.5 text-sm text-foreground hover:bg-muted data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
        className,
      )}
      {...props}
    >
      {children}
      {count != null && <i className="text-xs not-italic tabular-nums opacity-75">{count}</i>}
    </Toggle>
  );
}
