import { BUSY, type MainStep, type Step } from "../lib/git.ts";
import { gitAct } from "../lib/git-actions.ts";
import { useGit } from "../lib/git-store.ts";
import { Button } from "../ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu.tsx";
import { Icon } from "../ui/icon.tsx";

// One split button: the main step (Stage all, then Commit, then the next remote step) and a menu with every step,
// each unavailable one saying why under its name.
export function GitSplit({ main, all, prUrl }: { main: MainStep; all: Step[]; prUrl?: string }) {
  const busy = useGit((s) => s.busy);
  return (
    <div className="flex w-full">
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="More commit and remote actions"
            title="More commit and remote actions"
            className="min-h-(--btn-s) rounded-l-none border-l-border px-2"
          >
            <Icon name="chev" className="size-(--ico)" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[min(340px,calc(100vw-32px))] text-sm">
          {all.map((x) => (
            <DropdownMenuItem
              key={x.a}
              disabled={!!x.why || !!busy}
              onSelect={() => void gitAct(x.a)}
              className="flex-col items-start gap-0 py-1 data-[disabled]:opacity-100 data-[disabled]:text-muted-foreground"
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
