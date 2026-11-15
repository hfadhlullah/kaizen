import type { ComponentProps, ReactNode } from "react";
import { cn } from "@lib/core";
import { Icon, Tooltip, TooltipContent, TooltipTrigger } from "@web/ui";

// The board's one icon button: a square with one icon, always named (aria-label and tooltip). Two sizes: "md" (32px, the
// default: header and standalone actions) and "sm" (24px, 14px icon, 32px on a phone: bars, tab strips and the collapse
// buttons), so every button of a kind is the same size. `active` marks a control that currently changes what the page
// shows, such as a filter that is not "all".
export function IconButton({
  icon,
  label,
  active,
  size = "md",
  href,
  className,
  children,
  ...props
}: { icon: string | ReactNode; label: string; active?: boolean; size?: "sm" | "md"; href?: string } & Omit<
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
            "relative grid shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            size === "sm" ? "size-(--btn-xs) max-[640px]:size-8 [&_svg]:size-(--ico)" : "size-(--btn-s)",
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
