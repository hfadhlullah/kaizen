import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "@lib/core/utils.ts";

// variant: primary is the one main action of an area, default is any other, ghost is quiet (toolbars),
// danger is destructive. size: md (default) or sm. An icon-only button is IconButton, never a Button.
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm border px-3 py-1 text-base font-medium shadow-sm transition-colors disabled:cursor-default disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-foreground hover:border-muted-foreground",
        primary:
          "border-primary bg-primary text-primary-foreground hover:bg-[color-mix(in_srgb,var(--accent)_88%,var(--ink))]",
        ghost:
          "border-transparent bg-transparent text-muted-foreground shadow-none hover:bg-muted hover:text-foreground",
        danger: "border-border bg-card text-danger hover:border-danger",
      },
      size: { md: "min-h-(--btn-s)", sm: "min-h-(--btn-xs) px-2 text-sm" },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);
export function Button({
  className,
  variant,
  size,
  asChild,
  type = "button",
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp {...(asChild ? {} : { type })} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}
