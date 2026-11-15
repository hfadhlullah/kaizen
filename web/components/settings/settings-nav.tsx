import { useEffect, useRef } from "react";
import { host, cn } from "@lib/core";
import { pickPage, searchBox, setSettings, useSettings, SETTINGS_NAV } from "@lib/settings";
import { Icon, Input } from "@web/ui";
import { SettingsScope } from "./settings-scope.tsx";

// The icon tile: a small rounded square in the theme colour, as macOS draws its sidebar.
export const Tile = ({ name, className }: { name: string; className?: string }) => (
  <span className={cn("grid shrink-0 place-items-center rounded-sm text-muted-foreground", className)}>
    <Icon name={name} className="size-full max-h-[18px] max-w-[18px]" />
  </span>
);

// The sidebar: Back to app, the search, who is being edited, and the pages in four groups. Only pages with a match show
// while searching. On a phone it is the list of pages, and a picked page replaces it.
export function SettingsNav({
  hits,
  current,
  onSearchFocus,
}: {
  hits: string[];
  current: string | null;
  onSearchFocus: (on: boolean) => void;
}) {
  const q = useSettings((s) => s.q),
    back = useSettings((s) => s.back),
    search = useRef<HTMLInputElement>(null);
  // Ctrl+F searches settings, as in Orca. Only while the page shows: elsewhere it stays the browser's.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "f") return;
      e.preventDefault();
      search.current?.focus();
    };
    addEventListener("keydown", on);
    searchBox.el = search.current;
    return () => {
      removeEventListener("keydown", on);
      searchBox.el = null;
    };
  }, []);
  return (
    <nav
      aria-label="Settings"
      className="flex h-full min-h-0 flex-col px-3 pb-3.5 pt-[18px] max-[640px]:block max-[640px]:p-0"
    >
      <button
        id="sback"
        type="button"
        className="mb-1.5 flex h-(--row) shrink-0 items-center gap-(--gap) rounded-sm px-(--padx) text-base font-medium text-muted-foreground hover:text-foreground max-[640px]:hidden"
        onClick={() => (back ? history.back() : host.go("home", true))}
      >
        <Icon name="chev" className="size-(--ico) rotate-90" />
        Back to app
      </button>
      <div className="pb-2.5 max-[640px]:pb-3">
        <Input
          id="sq"
          ref={search}
          type="search"
          placeholder="Search settings"
          aria-label="Search settings"
          spellCheck={false}
          autoComplete="off"
          value={q}
          onChange={(e) => setSettings({ q: e.target.value })}
          onFocus={() => onSearchFocus(true)}
          onBlur={() => onSearchFocus(false)}
          // Esc clears a search; with nothing to clear it closes the panel, as it does outside the field.
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            if (q) setSettings({ q: "" });
            else host.closePanel();
          }}
        />
      </div>
      <SettingsScope />
      <div className="min-h-0 flex-1 overflow-y-auto pt-1 max-[640px]:overflow-visible max-[640px]:pt-0">
        {SETTINGS_NAV.map(([group, pages]) => {
          const shown = pages.filter((p) => hits.includes(p.id));
          if (!shown.length) return null;
          return (
            <div
              key={group}
              role="group"
              aria-label={group}
              className="mb-3.5 grid gap-px max-[640px]:mb-5 max-[640px]:gap-0 max-[640px]:divide-y max-[640px]:divide-border max-[640px]:overflow-hidden max-[640px]:rounded-lg max-[640px]:border max-[640px]:border-border max-[640px]:bg-card"
            >
              {shown.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-page={p.id}
                  aria-current={p.id === current ? "page" : undefined}
                  className={cn(
                    "group flex h-[30px] items-center gap-2 overflow-hidden whitespace-nowrap rounded-sm px-1.5 text-left text-sm text-foreground hover:bg-muted max-[640px]:h-11 max-[640px]:gap-3 max-[640px]:rounded-none max-[640px]:px-3 max-[640px]:text-[15px]",
                    "aria-[current=page]:bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] aria-[current=page]:font-medium aria-[current=page]:text-strong",
                  )}
                  onClick={() => {
                    // Picking a page ends typing in the search box (a tapped button takes no focus on iOS).
                    (document.activeElement as HTMLElement | null)?.blur?.();
                    pickPage(p.id);
                  }}
                >
                  <Tile
                    name={p.ico}
                    className="size-[22px] group-hover:text-foreground group-aria-[current=page]:text-primary max-[640px]:size-7"
                  />
                  <span className="truncate">{p.title}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
