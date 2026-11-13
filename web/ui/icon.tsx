import type { SVGProps } from "react";
import { cn } from "../lib/utils.ts";

// An icon from the board's SVG sprite (board.html, #i-<name>), the same set the old pages draw with ico().
export function Icon({ name, className, ...props }: { name: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg aria-hidden="true" className={cn("size-[18px]", className)} {...props}>
      <use href={`#i-${name}`} />
    </svg>
  );
}
