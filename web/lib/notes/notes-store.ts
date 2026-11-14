// The Notes tab's state: the card open, and the files picked per card. The files live here, not in the box: a redraw while
// the box is not focused (just after the file picker, say) used to rebuild it and drop them.
import { create } from "zustand";
import type { NoteCard } from "./notes.ts";

export type NotesView = { card: NoteCard; src: string | undefined; ro: boolean };
type Notes = {
  view: NotesView | null; // a new object on every draw, even of the same notes: the box refocuses on it
  files: Record<string, File[]>;
  refocus: string | null; // the card whose box takes focus back at the next draw (after a send)
};
export const useNotes = create<Notes>()(() => ({ view: null, files: {}, refocus: null }));
export const getNotes = useNotes.getState;
export const setNotes = useNotes.setState;
export const addNoteFiles = (k: string, fs: File[]) =>
  setNotes((s) => ({ files: { ...s.files, [k]: [...(s.files[k] ?? []), ...fs] } }));
export const clearNoteFiles = (k: string) =>
  setNotes((s) => {
    const { [k]: _gone, ...files } = s.files;
    return { files };
  });
