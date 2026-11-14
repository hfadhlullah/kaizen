// The board header's two pickers: the project the board is on (or All projects) and, in All projects, which projects
// show. Both read the server store (lib/server) and the "Showing" choice kept here; nothing publishes into them.
import { useMemo } from "react";
import { create } from "zustand";
import { getServer, useServer } from "@lib/server";

export type PickRow = { label: string; value: string; fresh: boolean };
export const ALL = "all";
// Which projects show in All projects: tick some, or none for every one. Kept per browser.
export const useShown = create<{ shown: string[] }>()(() => ({
  shown: (() => {
    try {
      return JSON.parse(localStorage.getItem("kz-show") ?? "null") || [];
    } catch {
      return [];
    }
  })(),
}));
export const shownSet = () => new Set(useShown.getState().shown);
export function setShown(shown: string[]) {
  try {
    localStorage.setItem("kz-show", JSON.stringify(shown));
  } catch {}
  useShown.setState({ shown });
}
export const toggleShown = (dir: string) => {
  const s = shownSet();
  s.has(dir) ? s.delete(dir) : s.add(dir);
  setShown([...s]);
};
export const clearShown = () => setShown([]);
// The projects the board lists, then the folders of cards whose project is not listed.
export function showable(state = getServer().state): { dir: string; label: string }[] {
  const l = [...state.projects];
  for (const c of state.cards)
    if (!l.some((p: { dir: string }) => p.dir === c.state)) l.push({ dir: c.state, label: c.where });
  return l;
}
// The choices of the project picker: All, the board's projects, folders found in the projects folder, then the actions.
export const projectRows = (state = getServer().state): PickRow[] =>
  [
    ["All projects", "all"],
    ...state.projects.map((p: { label: string; dir: string }) => [p.label, p.dir]),
    ...(state.fresh ?? []).map((p: { label: string; dir: string }) => [p.label, p.dir, 1]),
    ["New project…", "__new"],
    ["Find projects on this PC…", "__find"],
    ["Clone from GitHub…", "__clone"],
  ].map((p) => ({ label: p[0] as string, value: p[1] as string, fresh: !!p[2] }));
// What the pickers draw: the choices, the project the board is on ("" in All projects), what can show, what is ticked.
export function useProjectBar() {
  const state = useServer((s) => s.state),
    all = useServer((s) => s.all),
    shown = useShown((s) => s.shown);
  return useMemo(
    () => ({
      rows: projectRows(state),
      dir: all || !state.dir ? "" : (state.dir as string),
      showable: showable(state),
      shown,
    }),
    [state, all, shown],
  );
}

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
