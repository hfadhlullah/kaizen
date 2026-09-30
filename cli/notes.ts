// The notebook's files: plain markdown under <state>/notes/, folders and all, so any
// editor (Obsidian included) can open the same folder. Every name that arrives from
// the page goes through safeName before it becomes a path.
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { join, dirname, resolve, sep } from "node:path";

export type Note = { name: string; mtime: number; text: string };

export const notesDir = (state: string) => join(state, "notes");

// A note name is its path under notes/ without `.md`: `Work/Standup`. At most six
// folders deep; no segment that is empty, dotted, or holds a character some
// filesystem refuses. Returns the tidied name, or null.
export function safeName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const parts = name.trim().replace(/\.md$/i, "").split("/").map((p) => p.trim());
  if (parts.length > 6) return null;
  for (const p of parts) {
    if (!p || p.length > 120 || p.startsWith(".") || /[\\:*?"<>|\x00-\x1f]/.test(p)) return null;
  }
  return parts.join("/");
}

// The file for a name, or null when the name is unsafe or would land outside notes/.
function fileOf(state: string, name: unknown) {
  const n = safeName(name);
  if (!n) return null;
  const root = resolve(notesDir(state));
  const f = resolve(root, n + ".md");
  return f.startsWith(root + sep) ? { name: n, file: f } : null;
}

// ponytail: the whole vault is read on every list; fine for hundreds of notes, send
// names and mtimes only (and text on open) if a vault reaches thousands.
// Only names safeName keeps as they are: a file the notebook could not save back
// (`What?.md`, seven folders deep) is left to the editor that made it.
export function listNotes(state: string): Note[] {
  const root = notesDir(state), out: Note[] = [], seen = new Set<string>();
  const walk = (dir: string, prefix: string) => {
    let names: string[];
    // A symlinked folder is followed once: `ln -s .. notes/up` is not a loop.
    try { const real = realpathSync(dir); if (seen.has(real)) return; seen.add(real); names = readdirSync(dir); } catch { return; }
    for (const n of names) {
      if (n.startsWith(".")) continue;                     // .trash, .obsidian
      const p = join(dir, n);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p, prefix + n + "/");
      else if (n.toLowerCase().endsWith(".md") && safeName(prefix + n) === prefix + n.slice(0, -3)) {
        try { out.push({ name: prefix + n.slice(0, -3), mtime: st.mtimeMs, text: readFileSync(p, "utf8") }); } catch { /* vanished */ }
      }
    }
  };
  walk(root, "");
  return out.sort((a, b) => b.mtime - a.mtime);
}

// `base` is the mtime the page loaded the note at, 0 for a note it is creating. Any
// other mtime on disk means someone else wrote it since: refuse, and say what is there.
export function saveNote(state: string, name: unknown, text: string, base: number):
  { ok: true; name: string; mtime: number } | { ok: false; why: string; text?: string; mtime?: number } {
  const t = fileOf(state, name);
  if (!t) return { ok: false, why: "bad name" };
  if (existsSync(t.file)) {
    const now = statSync(t.file).mtimeMs;
    if (now !== base) return { ok: false, why: "conflict", text: readFileSync(t.file, "utf8"), mtime: now };
  } else if (base) return { ok: false, why: "conflict", text: "", mtime: 0 };
  mkdirSync(dirname(t.file), { recursive: true });
  writeFileSync(t.file, text);
  return { ok: true, name: t.name, mtime: statSync(t.file).mtimeMs };
}

// Also how a note moves between folders: `Standup` to `Work/Standup`.
export function renameNote(state: string, from: unknown, to: unknown): string | null {
  const a = fileOf(state, from), b = fileOf(state, to);
  if (!a || !b) return "bad name";
  if (!existsSync(a.file)) return "no such note";
  if (a.file === b.file) return null;
  // A case-only rename on a case-insensitive disk finds `to` already there: it is `from`.
  if (existsSync(b.file) && a.file.toLowerCase() !== b.file.toLowerCase()) return "a note with that name exists";
  mkdirSync(dirname(b.file), { recursive: true });
  renameSync(a.file, b.file);
  prune(state, dirname(a.file));
  return null;
}

// Never unlinked: moved to notes/.trash/, where Obsidian keeps its own too.
export function deleteNote(state: string, name: unknown): string | null {
  const t = fileOf(state, name);
  if (!t) return "bad name";
  if (!existsSync(t.file)) return "no such note";
  const trash = join(notesDir(state), ".trash");
  mkdirSync(trash, { recursive: true });
  renameSync(t.file, join(trash, `${Date.now().toString(36)}-${t.name.replace(/\//g, "~")}.md`));
  prune(state, dirname(t.file));
  return null;
}

// A folder exists while it holds something; remove the ones a move or delete emptied.
function prune(state: string, dir: string) {
  const root = resolve(notesDir(state));
  for (let d = resolve(dir); d.startsWith(root + sep); d = dirname(d)) {
    try { if (readdirSync(d).length) return; rmdirSync(d); } catch { return; }
  }
}
