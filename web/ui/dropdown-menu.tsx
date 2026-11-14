import { DropdownMenu as MenuPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn, portalRoot } from "../lib/core/utils.ts";

export const DropdownMenu = (props: ComponentProps<typeof MenuPrimitive.Root>) => (
  <MenuPrimitive.Root modal={false} {...props} />
);
export const DropdownMenuTrigger = MenuPrimitive.Trigger;
export function DropdownMenuContent({
  className,
  align = "end",
  sideOffset = 4,
  ...props
}: ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal container={portalRoot()}>
      <MenuPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "z-50 flex min-w-40 max-w-[calc(100vw-32px)] flex-col rounded-md border border-border bg-card p-1.5 text-base text-foreground shadow-md outline-none animate-fade-in",
          className,
        )}
        {...props}
      />
    </MenuPrimitive.Portal>
  );
}
export const DropdownMenuItem = ({ className, ...props }: ComponentProps<typeof MenuPrimitive.Item>) => (
  <MenuPrimitive.Item
    className={cn(
      "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-muted-foreground outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-muted data-[highlighted]:text-foreground",
      className,
    )}
    {...props}
  />
);
export const DropdownMenuSeparator = ({ className, ...props }: ComponentProps<typeof MenuPrimitive.Separator>) => (
  <MenuPrimitive.Separator className={cn("my-1 h-px bg-border", className)} {...props} />
);
export const DropdownMenuLabel = ({ className, ...props }: ComponentProps<typeof MenuPrimitive.Label>) => (
  <MenuPrimitive.Label className={cn("px-2 py-1 text-sm text-muted-foreground", className)} {...props} />
);
export const DropdownMenuRadioGroup = MenuPrimitive.RadioGroup;
// A choice among several, one marked (menuitemradio): the severity filter, sort orders.
export const DropdownMenuRadioItem = ({ className, ...props }: ComponentProps<typeof MenuPrimitive.RadioItem>) => (
  <MenuPrimitive.RadioItem
    className={cn(
      "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-foreground outline-none data-[highlighted]:bg-muted data-[state=checked]:text-primary",
      className,
    )}
    {...props}
  />
);
