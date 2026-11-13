import type { ComponentProps } from "react";
import { cn } from "../lib/utils.ts";

export const Skeleton = ({ className, ...props }: ComponentProps<"span">) => (
  <span className={cn("block rounded-sm bg-muted motion-safe:animate-pulse", className)} {...props} />
);
