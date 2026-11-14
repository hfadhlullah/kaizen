import { useEffect, useRef } from "react";
import { askEnd, cn, post } from "@lib/core";
import { labelOf, pickTerminal, stateOf, terminalActions, terminalLayout, useArranged } from "@lib/terminal";
import { Button, Icon } from "@web/ui";

const DOT = { running: "bg-running", asking: "bg-warning", ended: "bg-muted-foreground opacity-60" };

// Above the tiles: the hidden live terminals as chips that bring one back, and on a phone one tab per terminal (a phone
// shows one at a time: stacked, each took every swipe and the page could only be scrolled by its thin headers).
export function TerminalBar() {
  const { a, all, phone } = useArranged(),
    on = useRef<HTMLDivElement>(null),
    tabs = phone && a.keys.length > 0;
  useEffect(() => {
    on.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [a.one, tabs]);
  if (!a.hid.length && !tabs) return null;
  const close = (k: string) => {
    // An ended session just goes; a live one asks first and exits.
    if (stateOf(all.get(k)!) === "ended") terminalLayout.hide(k);
    else void askEnd().then((yes) => yes && post("/pty/exit", { key: k }).then(() => terminalActions.reload()));
  };
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 text-xs",
        phone ? "border-b border-border px-3.5 pb-2" : "px-4 py-2",
      )}
    >
      {a.hid.length > 0 && (
        <>
          <span className="text-muted-foreground">Hidden</span>
          {a.hid.map((k) => (
            <Button
              key={k}
              size="sm"
              variant="ghost"
              className="text-[11px]"
              title="Show this terminal"
              onClick={() => terminalLayout.show(k)}
            >
              <Icon name="plus" className="size-3" />
              {labelOf(all.get(k)!)}
            </Button>
          ))}
        </>
      )}
      {tabs && (
        <div
          role="group"
          aria-label="Terminals"
          className="order-first flex min-w-0 flex-[1_0_100%] gap-1.5 overflow-x-auto [scrollbar-width:none]"
        >
          {a.keys.map((k) => {
            const c = all.get(k)!,
              sel = k === a.one;
            return (
              <div
                key={k}
                ref={sel ? on : undefined}
                className={cn(
                  "inline-flex h-[30px] flex-none items-center gap-1.5 rounded-full border border-border pr-2 pl-2.5 text-xs whitespace-nowrap text-muted-foreground",
                  sel && "border-primary bg-muted text-foreground",
                )}
              >
                <button
                  type="button"
                  aria-pressed={sel}
                  className="inline-flex h-full items-center gap-1.5"
                  onClick={() => pickTerminal(k)}
                >
                  <span className={cn("size-2 shrink-0 rounded-full", DOT[stateOf(c)])} />
                  <span>{labelOf(c)}</span>
                </button>
                <button
                  type="button"
                  title="Close terminal"
                  aria-label="Close terminal"
                  className="grid size-4 place-items-center rounded-full text-[13px] leading-none opacity-60 hover:bg-border hover:text-foreground hover:opacity-100"
                  onClick={() => close(k)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
