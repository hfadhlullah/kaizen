import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn, portalRoot } from "@lib/core/utils.ts";

export const TooltipProvider = (props: ComponentProps<typeof TooltipPrimitive.Provider>) => (
  <TooltipPrimitive.Provider delayDuration={400} {...props} />
);
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;
// Themed like the toast and the popovers (the card colour, a soft border), not inverted to the opposite theme.
export const TooltipContent = ({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) => (
  <TooltipPrimitive.Portal container={portalRoot()}>
    <TooltipPrimitive.Content
      sideOffset={sideOffset}
      className={cn(
        "z-50 max-w-72 rounded-sm border border-border bg-card px-2 py-1 text-sm text-foreground shadow-md animate-fade-in",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
);
