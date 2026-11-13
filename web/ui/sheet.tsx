import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn, portalRoot } from "../lib/utils.ts";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = ({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) => (
  <DialogPrimitive.Title className={cn("text-[16px] font-semibold text-strong", className)} {...props} />
);
export const SheetDescription = DialogPrimitive.Description;
// The board's right-hand drawer (the run panel's aside rules): full height, 520px, the page behind it dimmed and
// blurred. Opens and closes with a slide; Escape, the backdrop and SheetClose shut it, and focus goes back to
// the control that opened it.
export function SheetContent({ className, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal container={portalRoot()}>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--bg)_60%,transparent)] backdrop-blur-[3px] data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in" />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[520px] max-w-full flex-col border-l border-border bg-card text-foreground shadow-md outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right",
          className,
        )}
        {...props}
      />
    </DialogPrimitive.Portal>
  );
}
