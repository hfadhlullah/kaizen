// Sending a note: the same request as the old box, POST /note with the files as data URLs.
import { host, post, toast } from "@lib/core";
import { stopDictation } from "@lib/dictation";
import { clearNoteFiles, getNotes, setNotes } from "./notes-store.ts";
import { noteBody, noteKey, type NoteCard } from "./notes.ts";

const DK = "kz-d:";
// Sends the text and the files waiting for this card. On success the box is emptied (its draft too), the board reloads, and
// the box takes focus back at the next draw. Returns whether it went.
export async function sendNote(c: NoteCard, text: string, files: File[]): Promise<boolean> {
  stopDictation(true);
  text = text.trim();
  if (!text && !files.length) return false;
  const r = await post("/note", noteBody(c, text, await host.dataUrls(files)));
  if (!r.ok) return false;
  const k = noteKey(c);
  clearNoteFiles(k);
  try {
    sessionStorage.removeItem(DK + "n:" + k);
  } catch {}
  toast("Noted");
  // Focus anywhere in the notes blocks the redraw: blur it so the note shows.
  setNotes({ refocus: k });
  (document.activeElement as HTMLElement | null)?.blur();
  host.reload();
  return true;
}
export const takeRefocus = (k: string) => {
  if (getNotes().refocus !== k) return false;
  setNotes({ refocus: null });
  return true;
};
