import type { ComponentProps } from "react";
import { cn } from "../lib/core/utils.ts";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full resize-none bg-transparent text-base leading-normal text-foreground outline-none placeholder:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
