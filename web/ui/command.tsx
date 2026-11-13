import { Command as CommandPrimitive } from "cmdk";
import type { ComponentProps } from "react";
import { cn } from "../lib/utils.ts";

// A searchable list: the type-to-filter part of the Picker.
export const Command = ({ className, ...props }: ComponentProps<typeof CommandPrimitive>) => (
  <CommandPrimitive className={cn("flex flex-col text-base", className)} {...props} />
);
export const CommandInput = ({ className, ...props }: ComponentProps<typeof CommandPrimitive.Input>) => (
  <CommandPrimitive.Input
    className={cn(
      "mb-1.5 h-8 w-full rounded-sm border border-border bg-card px-2.5 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-muted-foreground",
      className,
    )}
    {...props}
  />
);
export const CommandList = ({ className, ...props }: ComponentProps<typeof CommandPrimitive.List>) => (
  <CommandPrimitive.List className={cn("max-h-72 overflow-auto", className)} {...props} />
);
export const CommandEmpty = ({ className, ...props }: ComponentProps<typeof CommandPrimitive.Empty>) => (
  <CommandPrimitive.Empty className={cn("px-2 py-3 text-center text-muted-foreground", className)} {...props} />
);
export const CommandItem = ({ className, ...props }: ComponentProps<typeof CommandPrimitive.Item>) => (
  <CommandPrimitive.Item
    className={cn(
      "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-muted-foreground data-[selected=true]:bg-muted data-[selected=true]:text-foreground",
      className,
    )}
    {...props}
  />
);
export const CommandGroup = ({ className, ...props }: ComponentProps<typeof CommandPrimitive.Group>) => (
  <CommandPrimitive.Group
    className={cn(
      "[&_[cmdk-group-heading]]:flex [&_[cmdk-group-heading]]:items-center [&_[cmdk-group-heading]]:gap-1.5 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-sm [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-foreground",
      className,
    )}
    {...props}
  />
);
