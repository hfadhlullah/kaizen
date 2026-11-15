import { useMemo } from "react";
import { parseQuery, setQuery, tagCounts, toggleTag, useVault } from "@lib/notebook";
import { NoteTree } from "./note-tree.tsx";

// The sidebar: the search box (words, or #tag), the tags with their counts, and the notes.
export function NotesSide() {
  const notes = useVault((s) => s.notes),
    query = useVault((s) => s.query);
  const tags = useMemo(() => tagCounts(notes), [notes]);
  const on = parseQuery(query).tag;
  return (
    <nav className="side" aria-label="Notes">
      <input
        className="sel"
        id="q"
        type="search"
        placeholder="Search notes, or #tag"
        aria-label="Search notes"
        spellCheck={false}
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <h3 id="tagsh" hidden={!tags.length}>
        Tags
      </h3>
      <div className="tags" id="tags">
        {tags.map(([g, c]) => (
          <button
            key={g}
            className={"chip" + (g === on ? " on" : "")}
            data-tag={g}
            aria-pressed={g === on}
            onClick={() => setQuery(toggleTag(query, g))}
          >
            #{g} <span>{c}</span>
          </button>
        ))}
      </div>
      <h3>Notes</h3>
      <div className="tree" id="tree">
        <NoteTree />
      </div>
    </nav>
  );
}
