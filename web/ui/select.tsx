import { Select as SelectPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn, portalRoot } from "../lib/utils.ts";
import { Icon } from "./icon.tsx";

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;
// The board's .sel dropdown: 32px (sm: 28px), chevron on the right.
export function SelectTrigger({
  className,
  size = "md",
  children,
  ...props
}: ComponentProps<typeof SelectPrimitive.Trigger> & { size?: "sm" | "md" }) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        "inline-flex max-w-full items-center justify-between gap-2 rounded-sm border border-border bg-card px-2.5 text-base text-foreground hover:border-muted-foreground data-[placeholder]:text-muted-foreground",
        size === "sm" ? "h-7 text-sm" : "h-(--btn-s)",
        className,
      )}
      {...props}
    >
      <span className="min-w-0 truncate">{children}</span>
      <SelectPrimitive.Icon asChild>
        <Icon name="chev" className="size-3 shrink-0 text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}
export function SelectContent({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal container={portalRoot()}>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={4}
        className={cn(
          "z-50 max-h-72 min-w-(--radix-select-trigger-width) max-w-[calc(100vw-32px)] overflow-hidden rounded-md border border-border bg-card p-1.5 text-base text-foreground shadow-md animate-fade-in",
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}
export const SelectItem = ({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) => (
  <SelectPrimitive.Item
    className={cn(
      "flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-muted-foreground outline-none data-[highlighted]:bg-muted data-[highlighted]:text-foreground data-[state=checked]:font-medium data-[state=checked]:text-foreground",
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <SelectPrimitive.ItemIndicator className="ml-auto">
      <Icon name="check" className="size-3.5 text-primary" />
    </SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>
);
