import type { FormEvent, ReactNode } from "react";
import { cn } from "../lib/core/index.ts";

// The frame every Board form sits in: inline in a column (a bordered box that stands where the card was) or plain
// inside a dialog, which brings its own frame. Enter inside a field never submits the page.
export function FormFrame({ inline, children, label }: { inline?: boolean; children: ReactNode; label: string }) {
  return (
    <form
      aria-label={label}
      onSubmit={(e: FormEvent) => e.preventDefault()}
      className={cn(
        "flex min-w-0 flex-col gap-2 whitespace-normal text-base [overflow-wrap:anywhere]",
        inline && "rounded-sm border border-primary bg-card p-3 shadow-md",
      )}
    >
      {children}
    </form>
  );
}
