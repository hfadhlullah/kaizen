// The notebook page's state: the project and its notes, the note open, how its save stands, the search box and the
// page's own switches (full screen, width, the narrow layout's drawer). Read by the components; written by vault-actions.
import { create } from "zustand";
import type { Conflict, SaveState } from "./autosave.ts";
import { emptyBoard, type Board } from "./engine-types.ts";
import type { Note } from "./vault-rules.ts";

export type Project = { dir: string; label: string };
export type Vault = {
  ready: boolean; // the first list of notes has arrived
  dir: string; // the state dir whose notes/ is shown
  projects: Project[];
  notes: Note[];
  board: Board; // what [[run:...]] and [[idea:...]] can name, from /links
  open: string | null; // the note in the editor
  doc: number; // counts note openings: the editor is made again for each, never for a rename or a redraw
  save: SaveState;
  conflict: Conflict | null;
  query: string; // the search box
  shut: Record<string, true>; // folders folded in the tree, for this page load
  full: boolean; // the open note alone, no header or sidebar
  wide: boolean; // the whole paper side instead of the reading column (kept per browser)
  drawer: boolean; // the narrow layout's note list is open
  focus: "title" | "editor" | null; // where focus goes once the note just opened is drawn
  titleRev: number; // bumped to put the name box back to the note's name
};

const wideKey = "kz-note-wide";
export const readWide = () => {
  try {
    return localStorage.getItem(wideKey) === "1";
  } catch {
    return false; // no storage
  }
};
export const writeWide = (on: boolean) => {
  try {
    localStorage.setItem(wideKey, on ? "1" : "0");
  } catch {
    /* no storage */
  }
};

export const useVault = create<Vault>()(() => ({
  ready: false,
  dir: "",
  projects: [],
  notes: [],
  board: emptyBoard(),
  open: null,
  doc: 0,
  save: "saved",
  conflict: null,
  query: "",
  shut: {},
  full: false,
  wide: readWide(),
  drawer: false,
  focus: null,
  titleRev: 0,
}));
export const getVault = useVault.getState;
export const setVault = useVault.setState;
