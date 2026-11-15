// The Search palette (Ctrl/Cmd+K and the side menu's Search): whether it is open and what its New task row does; the rows are
// built by use-search-rows.ts from the side menu's data (search-rows.ts), the typing and choosing are the palette's own.
import { create } from "zustand";
import { match, type Item } from "./search-match.ts";

// newTask: what the New task row does with the typed text (the board knows how to open its form).
export const useSearch = create<{ open: boolean; newTask: (text: string) => void }>()(() => ({
  open: false,
  newTask: () => {},
}));

// What shows for `q`: typed, the group holding the best match comes first (so Enter takes it) with up to 8 rows each, then an
// offer to make a task of what was typed. Empty: what waits on you, then what you touched last; a board with little in it
// also lists the pages, so the palette is never bare.
const WORK = ["Current", "Workspaces", "Runs", "Tasks", "Chats & terminals"];
export function shownRows(all: Item[], q: string, newTask: (text: string) => void): Item[] {
  const t = q.trim();
  if (!t) {
    const recent = (a: Item, b: Item) => (b.at ?? 0) - (a.at ?? 0);
    const need = all.filter((i) => i.dot === "wait" && (i.group === "Runs" || i.group === "Tasks")).sort(recent).slice(0, 3);
    const last = all.filter((i) => WORK.includes(i.group) && !need.includes(i)).sort(recent).slice(0, 5);
    const rows = [...need.map((i) => ({ ...i, group: "Needs you" })), ...last.map((i) => ({ ...i, group: i.group === "Current" ? "Current" : "Recent" }))];
    if (rows.length < 4) rows.push(...all.filter((i) => i.group === "Actions" && i.ico === "page").map((i) => ({ ...i, group: "Go to" })));
    return rows;
  }
  const hit = match(all, q);
  const rows = [...new Set(hit.map((i) => i.group))].flatMap((g) => hit.filter((i) => i.group === g).slice(0, 8));
  rows.push({ group: "Create", title: `New task "${t}"`, hay: "", ico: "plus", act: () => newTask(t) });
  return rows;
}
