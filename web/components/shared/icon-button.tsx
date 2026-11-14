import type { ComponentProps, ReactNode } from "react";
import { cn } from "@lib/core";
import { Icon, Tooltip, TooltipContent, TooltipTrigger } from "@web/ui";

// The board's .ib: a 32px square with one icon, always named (aria-label and tooltip). `active` marks a
// control that currently changes what the page shows, such as a filter that is not "all".
export function IconButton({
  icon,
  label,
  active,
  href,
  className,
  children,
  ...props
}: { icon: string | ReactNode; label: string; active?: boolean; href?: string } & Omit<
  ComponentProps<"button">,
  "href"
>) {
  const Tag = (href ? "a" : "button") as "button";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Tag
          {...(href ? { href } : { type: "button" })}
          aria-label={active ? `${label} (on)` : label}
          className={cn(
            "relative grid size-(--btn-s) shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            active && "text-foreground",
            className,
          )}
          {...props}
        >
          {typeof icon === "string" ? <Icon name={icon} /> : icon}
          {active && (
            <span
              aria-hidden="true"
              className="absolute right-1.5 top-1.5 size-[7px] rounded-full bg-primary shadow-[0_0_0_2px_var(--bg)]"
            />
          )}
          {children}
        </Tag>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
