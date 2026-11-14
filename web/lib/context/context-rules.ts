// The Project context pane's rules, with no DOM: what its title, rows and links say. The pane (components/context) draws
// them; lib/context/context-store.ts reads the project.
export type Tab = "files" | "notes" | "terminal";
export type Entry = { name: string; dir?: boolean };
export type Note = { name: string };

// The title is the project's folder, which is the one before `.kaizen` in a state path.
export const contextTitle = (dir?: string | null) =>
  dir ? dir.split(/[\\/]/).filter(Boolean).at(-2) || "Project" : "Project";
// A note's row is indented one step per folder it sits in, up to four.
export const noteIndent = (name: string) => 8 + 10 * Math.min(name.split("/").length - 1, 4);
export const sortNotes = <T extends Note>(list: T[]) => [...list].sort((a, b) => a.name.localeCompare(b.name));
export const noteHref = (dir: string, name: string) =>
  "/notebook?dir=" + encodeURIComponent(dir) + "&note=" + encodeURIComponent(name);
export const entryLabel = (e: Entry) => (e.dir ? "▸ " : "   ") + e.name;
export const entryPath = (folder: string, e: Entry) => (folder ? folder + "/" + e.name : e.name);
export const parentOf = (path: string) => path.split("/").slice(0, -1).join("/");
export const treeUrl = (dir: string, path: string) =>
  "/project-tree?dir=" + encodeURIComponent(dir) + "&path=" + encodeURIComponent(path);
export const textUrl = (dir: string, path: string, download = false) =>
  "/project-text?dir=" +
  encodeURIComponent(dir) +
  "&path=" +
  encodeURIComponent(path) +
  (download ? "&download=1" : "");
export const sessionLabel = (c: { id?: string; text?: unknown; pty?: { alive?: boolean } }) =>
  (c.pty?.alive ? "● " : "○ ") + (c.id || String(c.text).split("\n")[0]);
