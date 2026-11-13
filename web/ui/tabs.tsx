import { Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../lib/utils.ts";

export const Tabs = TabsPrimitive.Root;
export const TabsList = ({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) => (
  <TabsPrimitive.List className={cn("flex items-center gap-0.5", className)} {...props} />
);
// A tab is a quiet pill; the selected one is filled. Content stays with the caller (it draws the page itself).
export const TabsTrigger = ({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) => (
  <TabsPrimitive.Trigger
    className={cn(
      "inline-flex min-h-[26px] items-center gap-1.5 rounded-full px-2 text-sm text-muted-foreground data-[state=active]:bg-[color-mix(in_srgb,var(--dim)_14%,transparent)] data-[state=active]:font-medium data-[state=active]:text-foreground",
      className,
    )}
    {...props}
  />
);
