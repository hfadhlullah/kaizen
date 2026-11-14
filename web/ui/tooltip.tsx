import { Tooltip as TooltipPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn, portalRoot } from "../lib/core/utils.ts";

export const TooltipProvider = (props: ComponentProps<typeof TooltipPrimitive.Provider>) => (
  <TooltipPrimitive.Provider delayDuration={400} {...props} />
);
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;
export const TooltipContent = ({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) => (
  <TooltipPrimitive.Portal container={portalRoot()}>
    <TooltipPrimitive.Content
      sideOffset={sideOffset}
      className={cn(
        "z-50 max-w-72 rounded-sm bg-foreground px-2 py-1 text-sm text-background animate-fade-in",
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
);
