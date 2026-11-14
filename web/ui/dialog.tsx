import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn, portalRoot } from "../lib/core/utils.ts";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = ({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) => (
  <DialogPrimitive.Title className={cn("text-lg font-semibold", className)} {...props} />
);
export const DialogDescription = ({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) => (
  <DialogPrimitive.Description className={cn("text-base text-muted-foreground", className)} {...props} />
);
// The board's dialog.kz: 480px, bg colour, soft border, 12px radius, a 45% black backdrop.
export function DialogContent({ className, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal container={portalRoot()}>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 flex w-[min(480px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-2.5 rounded-lg border border-border bg-background p-4 text-foreground outline-none",
          className,
        )}
        {...props}
      />
    </DialogPrimitive.Portal>
  );
}
