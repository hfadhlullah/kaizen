// The Project context pane as state (Zustand): whether it is open, its tab, and what its body shows (the project's files,
// one file, its notes, or the terminal sessions). The requests are here; the pane is components/context/context-panel.tsx.
// The old board code (board/context.ts) tells it which project is picked and which cards hold a terminal.
import { create } from "zustand";
import { host } from "@lib/core";
import { noteHref, parentOf, sortNotes, textUrl, treeUrl, type Entry, type Note, type Tab } from "./context-rules.ts";

export type Body =
  | { kind: "message"; text: string }
  | { kind: "notes"; dir: string; notes: Note[] }
  | { kind: "files"; folder: string; entries: Entry[] }
  | { kind: "file"; path: string; content: string }
  | { kind: "terminals" };
export type Session = { id?: string; text?: unknown; pty?: { alive?: boolean } } & Record<string, any>;
export const useContext = create<{
  open: boolean;
  tab: Tab;
  folder: string;
  dir: string;
  sessions: Session[];
  body: Body;
}>()(() => ({ open: false, tab: "files", folder: "", dir: "", sessions: [], body: { kind: "message", text: "" } }));
const set = useContext.setState,
  get = useContext.getState;
// What the pane asks of the old code: open a card on its agent's terminal.
export const contextActions: { openSession: (c: Session) => void } = { openSession: () => {} };
export const setContextActions = (a: typeof contextActions) => Object.assign(contextActions, a);
export const setContextData = (d: { dir?: string; sessions?: Session[] }) => set(d);

let generation = 0;
const say = (text: string) => set({ body: { kind: "message", text } });
const request = async (route: string) => {
  const response = await fetch(route, { headers: host.dirHeader() });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.message || "Could not load this project");
  return data;
};
// Each read is dropped when another one started after it.
async function read<T>(loading: string, route: string, show: (d: T) => void) {
  const gen = ++generation;
  say(loading);
  try {
    const data = await request(route);
    if (gen === generation) show(data);
  } catch (error) {
    if (gen === generation) say(String(error));
  }
}
export function showNotes() {
  const { dir } = get();
  void read<{ dir: string; notes: Note[] }>("Loading notes…", "/vault?dir=" + encodeURIComponent(dir), (d) =>
    set({
      body: d.notes.length
        ? { kind: "notes", dir: d.dir, notes: sortNotes(d.notes) }
        : { kind: "message", text: "No notes in this project yet." },
    }),
  );
}
export function showFiles(path = get().folder) {
  set({ folder: path });
  const { dir } = get();
  if (!dir) return (++generation, say("Pick a project to see its files."));
  void read<{ entries: Entry[] }>("Loading files…", treeUrl(dir, path), (d) =>
    set({ body: { kind: "files", folder: path, entries: d.entries } }),
  );
}
export function showFile(path: string) {
  void read<{ content: string }>("Loading file…", textUrl(get().dir, path), (d) =>
    set({ body: { kind: "file", path, content: d.content } }),
  );
}
export function showTerminals() {
  ++generation;
  set({ body: { kind: "terminals" } });
}
export function showTab(tab: Tab) {
  set({ tab });
  if (tab === "notes") showNotes();
  else if (tab === "files") showFiles();
  else showTerminals();
}
export const goUp = () => showFiles(parentOf(get().folder));
export { noteHref };

// The header's open button, set as a ref by the component that draws it: the dialog form of the pane returns focus to it.
export const ctxOpen: { el: HTMLElement | null } = { el: null };
export const setOpen = (open: boolean) => {
  set({ open });
  if (open) showTab(get().tab);
};
// The project changed: the folder is the new project's root, and an open pane reads it again.
export function projectChanged(dir: string) {
  set({ dir, folder: "" });
  if (get().open) showTab(get().tab);
}
