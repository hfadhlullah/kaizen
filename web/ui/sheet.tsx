import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn, portalRoot } from "@lib/core/utils.ts";

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
// A sheet rising from the bottom of a phone screen (the board's .pagsheet): full width, rounded top, the page dimmed.
export function BottomSheetContent({ className, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal container={portalRoot()}>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in" />
      <DialogPrimitive.Content
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col overflow-y-auto rounded-t-[16px] border-t border-border bg-card px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3 text-foreground outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom",
          className,
        )}
        {...props}
      />
    </DialogPrimitive.Portal>
  );
}
