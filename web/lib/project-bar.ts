// The board header's two pickers: the project the board is on (or All projects) and, in All projects, which projects show.
// board/cards.ts publishes what they need on every redraw; the pickers (components/project-bar.tsx) read it and ask the
// board to act through the host.
import { create } from "zustand";

export type PickRow = { label: string; value: string; fresh: boolean };
export const ALL = "all";
export const useProjectBar = create<{
  rows: PickRow[]; // [label, value] of every choice, from the board's /state
  dir: string; // the project the board is on; "" in All projects
  showable: { dir: string; label: string }[];
  shown: string[];
}>()(() => ({ rows: [], dir: "", showable: [], shown: [] }));
export const setProjectBar = useProjectBar.setState;

// What the "Showing" button says: how many of the projects the board lists are on.
export const showingLabel = (shown: string[], all: { dir: string }[]) => {
  const n = all.filter((p) => shown.includes(p.dir)).length;
  return n ? `Showing ${n} of ${all.length}` : "Showing all";
};
// The line under the "Showing" list.
export const showingCount = (shown: string[], all: { dir: string }[]) => {
  const n = all.filter((p) => shown.includes(p.dir)).length;
  return n ? `${n} of ${all.length} shown` : `All ${all.length} shown`;
};
// The values that are actions, not projects: they get a plus mark.
export const isAction = (v: string) => v === "__new" || v === "__find" || v === "__clone";
