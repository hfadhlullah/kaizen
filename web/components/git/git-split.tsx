import { useRef, useState } from "react";
import { BUSY, type MainStep, type Step, gitAct, busyOf, useGit } from "../../lib/git/index.ts";
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Icon } from "@web/ui";

// One split button: the main step (Stage all, then Commit, then the next remote step) and a menu with every step,
// each unavailable one saying why under its name.
export function GitSplit({ main, all, prUrl }: { main: MainStep; all: Step[]; prUrl?: string }) {
  const busy = useGit(busyOf),
    box = useRef<HTMLDivElement>(null),
    [width, setWidth] = useState<number>();
  return (
    <div ref={box} className="flex w-full">
      <Button
        disabled={!main.a || !!busy}
        onClick={() => void gitAct(main.a as "commit")}
        className="min-h-(--btn-s) flex-1 rounded-r-none"
      >
        {busy && BUSY[busy] ? (
          BUSY[busy]
        ) : (
          <>
            {main.icon && <Icon name={main.icon} className="size-(--ico-s) stroke-current stroke-2" />}
            {main.label}
          </>
        )}
      </Button>
      <DropdownMenu onOpenChange={(o) => o && setWidth(box.current?.offsetWidth)}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="More commit and remote actions"
            title="More commit and remote actions"
            className="min-h-(--btn-s) rounded-l-none border-l-border px-2"
          >
            <Icon name="chev" className="size-(--ico)" />
          </Button>
        </DropdownMenuTrigger>
        {/* As wide as the split button, as the old menu was. */}
        <DropdownMenuContent style={{ width }} className="text-sm">
          {all.map((x) => (
            <DropdownMenuItem
              key={x.a}
              disabled={!!x.why || !!busy}
              onSelect={() => void gitAct(x.a)}
              className="flex-col items-start gap-0 py-1 text-foreground data-[disabled]:text-muted-foreground data-[disabled]:opacity-100"
            >
              <span>{x.label}</span>
              {x.why && <small className="text-xs">{x.why}</small>}
            </DropdownMenuItem>
          ))}
          {prUrl && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <a href={prUrl} target="_blank" rel="noopener">
                  Open PR on GitHub
                </a>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
