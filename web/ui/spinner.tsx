import { cn } from "../lib/core/utils.ts";

// The building spinner: a ring with one dark quarter. Still when motion is off.
export const Spinner = ({ className }: { className?: string }) => (
  <span
    aria-hidden="true"
    className={cn(
      "block size-[22px] rounded-full border-2 border-border border-t-foreground motion-safe:animate-spin",
      className,
    )}
  />
);
