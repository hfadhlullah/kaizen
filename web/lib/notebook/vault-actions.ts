// What the notebook page does: reads and writes through /vault (the page never sees the filesystem), opens, creates,
// renames and deletes notes, and keeps the open note saved (Autosave, 600 ms; every move away flushes first).
import { ask, toast } from "@lib/core";
import { Autosave, type SaveResult } from "./autosave.ts";
import { lift } from "./deal.ts";
import type { EditorHandle } from "./engine.ts";
import type { EditorHost } from "./engine-types.ts";
import { resolve, freshName } from "./text.ts";
import { folderOf, renameMessage, renameTarget, type Note } from "./vault-rules.ts";
import { getVault, setVault, writeWide } from "./vault-store.ts";

// ---- the editor in the page (one at a time, registered by the component that made it)
let ed: EditorHandle | null = null;
export const setEditor = (h: EditorHandle | null) => {
  ed = h;
};
export const getEditor = () => ed;

async function post(body: Record<string, unknown>) {
  try {
    const r = await fetch("/vault", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dir: getVault().dir, ...body }),
    });
    return { status: r.status, ...(await r.json().catch(() => ({}))) } as Record<string, any>;
  } catch {
    return { status: 0, error: "The board is not running" } as Record<string, any>;
  }
}

// ---- saving (autosave.ts holds the rules; this wires it to the request, the editor and the store)
export const save = new Autosave({
  read: () => ed?.text() ?? null,
  timer: { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t as ReturnType<typeof setTimeout>) },
  save: async (name, text, base): Promise<SaveResult> => {
    const r = await post({ op: "save", name, text, base });
    return r.ok
      ? { ok: true, mtime: r.mtime }
      : { ok: false, status: r.status, error: r.error, text: r.text, mtime: r.mtime };
  },
  onState: (s, c) => setVault({ save: s, conflict: c }),
  onSaved: (name, text, mtime) => upsert({ name, mtime, text }),
  onError: toast,
});
export const flush = () => save.flush();
const upsert = (n: Note) => setVault((s) => ({ notes: [n, ...s.notes.filter((x) => x.name !== n.name)] }));
// Leaving with unsaved text: a keepalive request outlives the page (pagehide).
export function saveOnExit() {
  const v = getVault();
  if (v.open && ed && save.dirty && !save.conflict)
    void fetch("/vault", {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dir: v.dir, op: "save", name: v.open, text: ed.text(), base: save.base }),
    }).catch(() => {});
}
export const keepMine = () => save.keepMine();
export function takeTheirs() {
  const c = save.takeTheirs();
  if (c) ed?.replace(c.text);
}

// ---- the vault
export async function loadVault() {
  const { dir } = getVault();
  let r: { notes?: Note[]; error?: string };
  try {
    r = await (await fetch("/vault?dir=" + encodeURIComponent(dir))).json();
  } catch {
    toast("The board is not running");
    return;
  }
  if (!r.notes) {
    toast(r.error || "Could not read notes");
    return;
  }
  const notes = r.notes;
  // The board's items, for chips and completion; a failure keeps the last ones.
  let board = getVault().board;
  try {
    const b = await (await fetch("/links?dir=" + encodeURIComponent(dir))).json();
    if (Array.isArray(b.runs)) board = b;
  } catch {
    /* keep */
  }
  setVault({ notes, board, ready: true });
  const mine = getVault().open && notes.find((n) => n.name === getVault().open);
  // Someone else changed the open note: take it only when nothing typed here is unsaved.
  if (mine && mine.mtime !== save.base && !save.dirty && !save.busy) {
    save.adopt(mine.mtime);
    ed?.replace(mine.text);
  }
  ed?.refresh();
}

// False when the open note still holds text that is not on disk: it stays open.
export async function openNote(name: string | null): Promise<boolean> {
  if (name === getVault().open) return true;
  await flush();
  if (save.dirty) {
    toast(save.conflict ? "Choose Keep mine or Load theirs first" : "This note is not saved yet");
    return false;
  }
  lift();
  const v = getVault(),
    n = name ? v.notes.find((x) => x.name === name) : null;
  save.open(name, n?.mtime ?? 0);
  setVault({ open: name, doc: v.doc + 1, drawer: false });
  try {
    name ? sessionStorage.setItem("kz-note:" + v.dir, name) : sessionStorage.removeItem("kz-note:" + v.dir);
  } catch {
    /* private window */
  }
  return true;
}

async function create(name: string) {
  const r = await post({ op: "save", name, text: "", base: 0 });
  if (!r.ok) {
    toast(r.status === 409 ? "A note with that name exists" : r.error || "Could not create the note");
    return false;
  }
  upsert({ name: r.name, mtime: r.mtime, text: "" });
  return openNote(r.name);
}
export async function openOrCreate(name: string) {
  const hit = resolve(name, noteNames());
  if (hit) return void openNote(hit);
  if (await create(name)) setVault({ focus: "editor" });
}
export async function newNote() {
  const open = getVault().open;
  if (await create(freshName(noteNames(), open ? folderOf(open) : ""))) setVault({ focus: "title" });
}
export const noteNames = () => getVault().notes.map((n) => n.name);

// The name box lost focus (or Enter): rename, which is also a move when the name holds a `/`.
export async function renameNote(to: string) {
  const from = getVault().open,
    target = from ? renameTarget(from, to) : null;
  const reset = () => setVault((s) => ({ titleRev: s.titleRev + 1 }));
  if (!from || !target) return reset();
  await flush();
  const r = await post({ op: "rename", name: from, to });
  if (!r.ok) {
    toast(r.error || "Could not rename");
    return reset();
  }
  // Another note was opened meanwhile: the rename stands, the editor stays where it is.
  if (getVault().open !== from) return loadVault();
  // The same editor stays: only the name changes.
  save.renamed(target);
  setVault({ open: target });
  await loadVault();
  save.adopt(getVault().notes.find((n) => n.name === target)?.mtime ?? save.base);
  reset();
  toast(renameMessage(from, target));
}

export async function removeNote() {
  const name = getVault().open;
  if (!name) return;
  const yes = await ask({
    title: "Move this note to notes/.trash?",
    description: name,
    confirmLabel: "Delete",
    danger: true,
  });
  if (!yes || getVault().open !== name) return;
  save.discard();
  const r = await post({ op: "delete", name });
  if (!r.ok) {
    toast(r.error || "Could not delete");
    return;
  }
  toast("Moved to notes/.trash");
  setVault((s) => ({ notes: s.notes.filter((n) => n.name !== name) }));
  await openNote(null);
}

// ---- the project
export async function setProject(dir: string) {
  if (dir === getVault().dir) return;
  if (!(await openNote(null))) return;
  setVault({ dir, notes: [], ready: false, query: "" });
  const u = new URL(location.href);
  u.searchParams.set("dir", dir);
  window.history.replaceState(null, "", u);
  await loadVault();
}

// ---- the page's own switches
export const setQuery = (query: string) => setVault({ query });
export const toggleFolder = (path: string, open: boolean) =>
  setVault((s) => {
    if (!!s.shut[path] === !open) return {}; // the tree reports a folder's state on first draw too
    const shut = { ...s.shut };
    if (open) delete shut[path];
    else shut[path] = true;
    return { shut };
  });
export const setFull = (full: boolean) => setVault({ full });
export function setWide(wide: boolean) {
  writeWide(wide);
  setVault({ wide });
}
export const setDrawer = (drawer: boolean) => setVault({ drawer });

// ---- what the editor may ask of the page
export const vaultHost: EditorHost = {
  names: noteNames,
  board: () => getVault().board,
  dir: () => getVault().dir,
  edited: () => save.edit(),
  save: () => void flush(),
  openNote: (n) => void openNote(n),
  openOrCreate: (n) => void openOrCreate(n),
  search: setQuery,
  toast,
  // Leave for the board only once the note is on disk.
  async go(href) {
    await flush();
    if (save.dirty) return toast("This note is not saved yet");
    location.href = href;
  },
};
