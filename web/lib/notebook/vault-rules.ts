// What the notebook page decides from its list of notes, with no DOM: names and folders, the search box, the tags, the
// backlinks, how a rename reads, and the age beside a note. The page draws what these return.
import { resolve, tags, wikilinks } from "./text.ts";

export type Note = { name: string; mtime: number; text: string };

export const last = (name: string) => name.split("/").pop()!;
export const folderOf = (name: string) => (name.includes("/") ? name.slice(0, name.lastIndexOf("/")) : "");

// The name a rename asks for, as the server stores it: no `.md`, each part trimmed. Null when there is nothing to do (an
// empty box, or the note's own name).
export function renameTarget(open: string, to: string): string | null {
  const t = to.trim();
  if (!t || t === open) return null;
  return t
    .replace(/\.md$/i, "")
    .split("/")
    .map((p) => p.trim())
    .join("/");
}
// "Renamed" within a folder, "Moved to X" across folders (the top for none).
export const renameMessage = (from: string, to: string) =>
  folderOf(from) === folderOf(to) ? "Renamed" : `Moved to ${folderOf(to) || "the top"}`;

// The search box: empty, a `#tag`, or words. `tag` is set only for a `#` query (an empty tag matches every tagged note).
export type Query = { text: string; tag: string | null };
export function parseQuery(raw: string): Query {
  const text = raw.trim().toLowerCase();
  return { text, tag: text.startsWith("#") ? text.slice(1) : null };
}
// Notes the query keeps, in list order: a tag also matches its children (`#work` finds `work/standup`); words match
// the name or the text.
export function searchNotes(notes: Note[], q: Query): Note[] {
  if (!q.text) return notes;
  const tag = q.tag;
  return notes.filter((n) =>
    tag !== null
      ? tags(n.text).some((x) => x.tag === tag || x.tag.startsWith(tag + "/"))
      : n.name.toLowerCase().includes(q.text) || n.text.toLowerCase().includes(q.text),
  );
}
// Tags with the number of notes using each, most used first.
export function tagCounts(notes: Note[]): [string, number][] {
  const count = new Map<string, number>();
  for (const n of notes) for (const g of new Set(tags(n.text).map((x) => x.tag))) count.set(g, (count.get(g) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
// A tag chip pressed: the search becomes `#tag`, or empties when it already was.
export const toggleTag = (query: string, tag: string) => (query === "#" + tag ? "" : "#" + tag);

// Notes (other than `name`) that link to it by a wikilink.
export function backlinks(notes: Note[], name: string): Note[] {
  const names = notes.map((n) => n.name);
  return notes.filter((n) => n.name !== name && wikilinks(n.text).some((l) => resolve(l.name, names) === name));
}

// How long ago, in the one unit that fits: now, 5m, 3h, 2d.
export function age(ms: number, now = Date.now()) {
  const s = (now - ms) / 1000;
  return s < 60
    ? "now"
    : s < 3600
      ? `${Math.floor(s / 60)}m`
      : s < 86400
        ? `${Math.floor(s / 3600)}h`
        : `${Math.floor(s / 86400)}d`;
}

// The note the page opens at start: ?note= (the board's "Linked from notes") if it exists, else the one open last in
// this tab; null when that one is gone.
export function startNote(names: string[], asked: string | null, kept: string | null): string | null {
  const pick = asked && names.includes(asked) ? asked : kept;
  return pick && names.includes(pick) ? pick : null;
}
