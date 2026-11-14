import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "../lib/core/utils.ts";

// A small word or dot-and-word: tone says what it means (waiting on you, done, trouble), not what colour it is.
const badgeVariants = cva("inline-flex items-center gap-1.5 text-sm", {
  variants: {
    tone: {
      neutral: "text-muted-foreground",
      warning: "text-warning",
      success: "text-success",
      danger: "text-danger",
      ink: "text-foreground",
    },
  },
  defaultVariants: { tone: "neutral" },
});
export const Badge = ({ className, tone, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) => (
  <span className={cn(badgeVariants({ tone }), className)} {...props} />
);
