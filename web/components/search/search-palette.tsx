import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { shownRows, useSearch, useSearchRows } from "@lib/search";
import type { Item } from "@lib/search";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList, Dialog, DialogContent, DialogTitle } from "@web/ui";
import { StateDot } from "@components/shared";

const ICO: Record<string, ReactNode> = {
  ws: (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="8" r="2" />
      <path d="M6 8v8M18 10c0 4-6 3-12 6" />
    </>
  ),
  run: <path d="M5 4l14 8-14 8z" />,
  idea: <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z" />,
  chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
  term: <path d="M4 17l6-5-6-5M12 19h8" />,
  proj: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  page: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 9h16" />
    </>
  ),
  act: <path d="M13 3L5 14h6l-1 7 8-11h-6z" />,
  tab: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 9h8V5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </>
  ),
};
const Glyph = ({ name, className }: { name: string; className?: string }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
    <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {ICO[name] ?? <use href={`#i-${name}`} />}
    </g>
  </svg>
);

// The title with the typed words in bold, so it is clear why a row matched.
function Marked({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 ? (
          <b key={i} className="font-semibold text-strong">
            {part}
          </b>
        ) : (
          part
        ),
      )}
    </>
  );
}

// Search over everything the side menu holds: workspaces, runs and tasks, chats, terminals, projects, pages and actions.
// Rows come from `useSearchRows` (lib/search); typing filters them, Enter or a click opens one.
export function SearchPalette() {
  const open = useSearch((s) => s.open),
    newTask = useSearch((s) => s.newTask),
    items = useSearchRows(open);
  const [q, setQ] = useState(""),
    [sel, setSel] = useState("0");
  const rows = useMemo(() => shownRows(items, q, newTask), [items, q, newTask]);
  useEffect(() => {
    if (open) setQ("");
  }, [open]);
  const picked = useRef(false);
  const close = () => useSearch.setState({ open: false });
  // Rows are numbered by position, so the selection is a number as text; a new query starts on the first row.
  useEffect(() => setSel("0"), [q]);
  const groups: [string, { row: Item; n: number }[]][] = [];
  rows.forEach((row, n) => {
    const g = groups.find((x) => x[0] === row.group);
    g ? g[1].push({ row, n }) : groups.push([row.group, [{ row, n }]]);
  });
  const none = !!q.trim() && rows.length === 1;
  const words = useMemo(() => q.toLowerCase().split(/\s+/).filter(Boolean), [q]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent
        aria-label="Search"
        aria-describedby={undefined}
        // Closed by Escape or a click away: focus goes back to where it was. A chosen row takes the focus itself.
        onCloseAutoFocus={(e) => {
          if (!picked.current) return;
          picked.current = false;
          e.preventDefault();
        }}
        className="top-[14vh] w-[min(560px,calc(100vw-32px))] translate-y-0 gap-0 overflow-hidden rounded-md p-0 shadow-md"
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <Command shouldFilter={false} value={sel} onValueChange={setSel} loop className="max-h-[min(480px,72vh)]">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Glyph name="search" className="size-[15px] flex-none text-muted-foreground" />
            <CommandInput
              value={q}
              onValueChange={setQ}
              placeholder="Search"
              aria-label="Search"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="mb-0 h-10 min-w-0 flex-1 border-0 bg-transparent px-0 text-lg focus-visible:border-0"
            />
          </div>
          <CommandList className="max-h-none flex-1 overflow-auto p-1">
            {groups.map(([g, list]) => (
              <CommandGroup key={g} heading={g}>
                {list.map(({ row, n }) => (
                  <CommandItem
                    key={n}
                    value={String(n)}
                    className="h-(--btn-s) gap-2 px-2 text-base text-foreground"
                    onSelect={() => {
                      picked.current = true;
                      close();
                      // After the palette has gone: what a row opens takes the focus.
                      setTimeout(row.act, 0);
                    }}
                  >
                    <Glyph name={row.ico} className="size-3.5 flex-none text-muted-foreground" />
                    {row.dot && <StateDot state={row.dot} />}
                    <span className="min-w-0 truncate">
                      <Marked text={row.title} words={words} />
                    </span>
                    {row.sub && (
                      <span className="min-w-0 flex-[0_1_auto] truncate text-sm text-muted-foreground">{row.sub}</span>
                    )}
                    {row.when && (
                      <span className="ml-auto flex-none pl-2 text-xs text-muted-foreground">{row.when}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            {none && <div className="px-2 py-3.5 text-center text-sm text-muted-foreground">No results</div>}
          </CommandList>
          <span role="status" aria-live="polite" className="sr-only">
            {rows.length} result{rows.length === 1 ? "" : "s"} found
          </span>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
