import type { ComponentProps } from "react";
import { cn } from "../lib/utils.ts";

// The board's text field (.sel on an input): 32px, soft border, dims to the ink on hover.
export const fieldClass =
  "h-(--btn-s) w-full rounded-sm border border-border bg-card px-2.5 py-1 text-base text-foreground placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:border-muted-foreground aria-[invalid=true]:border-danger";
export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(fieldClass, className)} {...props} />;
}
