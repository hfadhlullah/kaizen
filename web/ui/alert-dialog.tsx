import { AlertDialog as AlertPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn, portalRoot } from "../lib/core/utils.ts";
import { buttonVariants } from "./button.tsx";

export const AlertDialog = AlertPrimitive.Root;
export const AlertDialogTitle = ({ className, ...props }: ComponentProps<typeof AlertPrimitive.Title>) => (
  <AlertPrimitive.Title className={cn("text-lg font-semibold", className)} {...props} />
);
export const AlertDialogDescription = ({ className, ...props }: ComponentProps<typeof AlertPrimitive.Description>) => (
  <AlertPrimitive.Description className={cn("text-base text-muted-foreground", className)} {...props} />
);
export function AlertDialogContent({ className, ...props }: ComponentProps<typeof AlertPrimitive.Content>) {
  return (
    <AlertPrimitive.Portal container={portalRoot()}>
      <AlertPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45" />
      <AlertPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 flex w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-2.5 rounded-lg border border-border bg-background p-4 text-foreground outline-none",
          className,
        )}
        {...props}
      />
    </AlertPrimitive.Portal>
  );
}
export const AlertDialogCancel = ({ className, ...props }: ComponentProps<typeof AlertPrimitive.Cancel>) => (
  <AlertPrimitive.Cancel className={cn(buttonVariants({ variant: "default" }), className)} {...props} />
);
export const AlertDialogAction = ({
  className,
  danger,
  ...props
}: ComponentProps<typeof AlertPrimitive.Action> & { danger?: boolean }) => (
  <AlertPrimitive.Action
    className={cn(buttonVariants({ variant: danger ? "danger" : "primary" }), className)}
    {...props}
  />
);
