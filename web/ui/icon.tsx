import type { SVGProps } from "react";
import { cn } from "../lib/core/utils.ts";

// An icon from the board's SVG sprite (board.html), the same set the old pages draw with ico(). `sprite` is the
// symbol prefix: "i" (default, #i-<name>), "s" (status marks), "c" (agents and tags), "t" (run tabs).
export function Icon({
  name,
  sprite = "i",
  className,
  ...props
}: { name: string; sprite?: "i" | "s" | "c" | "t" } & SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" className={cn("size-[18px]", className)} {...props}>
      <use href={`#${sprite}-${name}`} />
    </svg>
  );
}
