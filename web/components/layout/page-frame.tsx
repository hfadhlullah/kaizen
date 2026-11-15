import type { ReactNode, Ref } from "react";
import { cn } from "@lib/core";

// The template for a page shaped as the Chat screen is: a sidebar on the left (the same 280 px as the side menu), and on
// the right a rounded, bordered card with a header bar (title and actions) over a scrolling body. The card ends flush
// on the footer and keeps the 8 px gap above and beside it, as the shell's own card does. On a phone the card goes
// (no border, no header bar: the panel's head names the page) and `phone` says which slot shows, the sidebar as a list
// or the content as its page, one at a time. Slots: `sidebar`, `title` + `actions` (the header bar), children (the body).
export function PageFrame({
  sidebar,
  title,
  actions,
  phone = "content",
  bodyRef,
  children,
}: {
  sidebar: ReactNode;
  title: ReactNode;
  actions?: ReactNode;
  phone?: "sidebar" | "content";
  bodyRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <div className="grid h-full grid-cols-[280px_minmax(0,1fr)] max-[640px]:block max-[640px]:h-auto">
      <div className={cn("min-h-0 min-w-0", phone === "content" && "max-[640px]:hidden")}>{sidebar}</div>
      <div
        className={cn(
          "mr-2 mt-2 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-background",
          "max-[640px]:m-0 max-[640px]:overflow-visible max-[640px]:rounded-none max-[640px]:border-0 max-[640px]:bg-transparent",
          phone === "sidebar" && "max-[640px]:hidden",
        )}
      >
        <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-border/60 pl-7 pr-5 max-[640px]:hidden">
          <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h1>
          {actions}
        </header>
        <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto max-[640px]:overflow-visible">
          {children}
        </div>
      </div>
    </div>
  );
}
