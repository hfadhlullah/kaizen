import type { ReactElement, ReactNode } from "react";
import { cn } from "@lib/core";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@web/ui";

export type Choice = { value: string; label: ReactNode; on?: boolean };
// A small menu of choices (a request's Kind, its Collection): the current one is marked, a pick closes it. The one
// child is the button that opens it (a Button, an IconButton, a plain button).
export function ChoiceMenu({
  label,
  choices,
  onPick,
  children,
}: {
  label: string;
  choices: Choice[];
  onPick: (value: string) => void;
  children: ReactElement;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent
        aria-label={label}
        className="max-h-[min(360px,calc(100vh-16px))] min-w-[200px] overflow-y-auto"
      >
        {choices.map((c) => (
          <DropdownMenuItem
            key={c.value}
            onSelect={() => onPick(c.value)}
            aria-current={c.on || undefined}
            className={cn(c.on && "bg-muted font-medium text-foreground")}
          >
            {c.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
