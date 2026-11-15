import { useEffect, useRef } from "react";
import { filterBoxes, setQuery, useBoard } from "@lib/board";
import { useRoute } from "@lib/router";

// The header's filter box: it narrows the Board's cards or workspaces by what is typed (kept per tab) and Escape clears it. The
// Board and Tasks share the text; `/` focuses the one that shows.
export function FilterBox({
  id = "bq",
  placeholder,
  className = "sel",
}: {
  id?: string;
  placeholder?: string;
  className?: string;
}) {
  const query = useBoard((s) => s.query),
    ws = useBoard((s) => s.mode === "ws"),
    board = useRoute((r) => r.view === "board"),
    el = useRef<HTMLInputElement>(null);
  useEffect(() => filterBoxes.add(el.current!), []);
  const hint = placeholder ?? (board && ws ? "Search workspaces (press /)" : "Filter cards (press /)");
  return (
    <input
      ref={el}
      type="search"
      className={className}
      id={id}
      placeholder={hint}
      aria-label="Filter cards"
      spellCheck={false}
      autoComplete="off"
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.stopPropagation();
        setQuery("");
        e.currentTarget.blur();
      }}
    />
  );
}
