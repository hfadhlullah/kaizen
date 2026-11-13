import { Toggle as TogglePrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "../lib/utils.ts";

// A pressed/not-pressed button; Chip and the filter popup's options are built on it.
export const Toggle = ({ className, ...props }: ComponentProps<typeof TogglePrimitive.Root>) => (
  <TogglePrimitive.Root className={cn(className)} {...props} />
);
