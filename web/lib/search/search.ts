// The Search palette (Ctrl/Cmd+K and the side menu's Search): whether it is open and what its New task row does; the rows are
// built by use-search-rows.ts from the side menu's data (search-rows.ts), the typing and choosing are the palette's own.
import { create } from "zustand";
import { match, type Item } from "./search-match.ts";

export const ORDER = ["Current", "Workspaces", "Tabs", "Chats & terminals", "Runs", "Tasks", "Projects", "Actions"];
// With nothing typed each group shows its most recent few, as Orca's does.
const CAP: Record<string, number> = { Workspaces: 5, Tabs: 4, "Chats & terminals": 5, Runs: 5, Tasks: 3, Projects: 5 };
// newTask: what the New task row does with the typed text (the board knows how to open its form).
export const useSearch = create<{ open: boolean; newTask: (text: string) => void }>()(() => ({
  open: false,
  newTask: () => {},
}));

// What shows for `q`: typed, the group holding the best match comes first (so Enter takes it) with up to 8 rows each,
// then an offer to make a task of what was typed; empty, each group's most recent few.
export function shownRows(all: Item[], q: string, newTask: (text: string) => void): Item[] {
  const t = q.trim();
  const hit = t ? match(all, q) : all.slice().sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  const order = t ? [...new Set(hit.map((i) => i.group))] : ORDER;
  const rows = order.flatMap((g) => {
    const of = hit.filter((i) => i.group === g);
    return of.slice(0, t ? 8 : (CAP[g] ?? of.length));
  });
  if (t) rows.push({ group: "Create", title: `New task "${t}"`, hay: "", ico: "plus", act: () => newTask(t) });
  return rows;
}
