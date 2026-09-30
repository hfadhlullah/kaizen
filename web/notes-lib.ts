// The notebook's text rules, with no DOM and no CodeMirror: the page uses them for the
// sidebar and backlinks, the editor for its decorations, and cli/notes.test.ts runs them.

// Code is where `[[x]]` and `#x` are literal: fences and inline spans are blanked to
// spaces of the same length, so offsets found in what is left still point into `text`.
// Indented code is a run of lines at four spaces or a tab that starts after a blank
// line (or the text's start); an indented line straight under a paragraph or a list
// item is its continuation, not code.
export function uncode(text: string) {
  const blank = (s: string) => s.replace(/[^\n]/g, " ");
  let prev = "", code = false;
  const indented = text
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?(?:^\1[^\n]*$|(?![\s\S]))/gm, blank)
    .split("\n").map((l) => {
      code = /^( {4}|\t)/.test(l) && l.trim() !== "" ? code || prev.trim() === "" : l.trim() === "" && code;
      prev = l;
      return code ? blank(l) : l;
    }).join("\n");
  return indented.replace(/(`+)[^`\n]+?\1/g, blank);
}

// `target` is everything before the `|`; `name` is it up to the `#`, `anchor` after.
export type Wikilink = { from: number; to: number; name: string; label: string; target: string; anchor: string };
const WIKI = /\[\[([^\[\]|\n]+?)(?:\|([^\[\]\n]+?))?\]\]/g;
export function wikilinks(text: string): Wikilink[] {
  const out: Wikilink[] = [];
  for (const m of uncode(text).matchAll(WIKI)) {
    // A heading anchor (`[[Note#Part]]`) still links to the note.
    const target = m[1]!.trim(), at = target.indexOf("#");
    const name = (at < 0 ? target : target.slice(0, at)).trim(), anchor = at < 0 ? "" : target.slice(at + 1).trim();
    if (name) out.push({ from: m.index!, to: m.index! + m[0].length, name, label: (m[2] ?? m[1]!).trim(), target, anchor });
  }
  return out;
}

// A link to the board instead of a note: `run:<id>` with an optional anchor naming a
// tab, `finding-<n>` or `backlog-<n>`, or `idea:<text>` (the whole target, `#` and all).
// Null for a note link. Note names can never hold `:`, so the two never collide.
export const TABS = ["request", "notes", "plan", "work", "preview", "review", "backlog"] as const;
export type BoardLink =
  | { kind: "run"; id: string; tab?: (typeof TABS)[number]; item?: { type: "finding" | "backlog"; n: number } }
  | { kind: "idea"; text: string };
export function boardLink(w: Pick<Wikilink, "name" | "anchor" | "target">): BoardLink | null {
  const idea = /^idea:\s*(.+)$/i.exec(w.target);
  if (idea) return { kind: "idea", text: idea[1]!.trim() };
  const run = /^run:\s*([\w.-]+)$/i.exec(w.name);
  if (!run) return null;
  const a = w.anchor.toLowerCase(), item = /^(finding|backlog)-(\d+)$/.exec(a);
  if (item) return { kind: "run", id: run[1]!, tab: item[1] === "finding" ? "review" : "backlog", item: { type: item[1] as "finding" | "backlog", n: Number(item[2]) } };
  return { kind: "run", id: run[1]!, ...((TABS as readonly string[]).includes(a) ? { tab: a as (typeof TABS)[number] } : {}) };
}

// A run id as written: the directory name, or the name without its date, which
// means the newest run of that name (ids sort by date).
export function resolveRun(id: string, ids: string[]): string | null {
  if (ids.includes(id)) return id;
  return ids.filter((x) => /^\d{4}-\d{2}-\d{2}-/.test(x) && x.slice(11) === id).sort().pop() ?? null;
}

// What a chip says after the run's name: `finding 2`, `backlog 3`, `review`.
export function anchorWords(l: BoardLink) {
  if (l.kind !== "run") return "";
  return l.item ? `${l.item.type} ${l.item.n}` : l.tab ?? "";
}

// `#tag` at the start of a line or after whitespace, with at least one letter; not a
// heading (`# Title`), not `#1`, not inside code. Tags nest with `/` as in Obsidian.
export type Tag = { from: number; to: number; tag: string };
const TAG = /(^|[ \t(])#([\p{L}\p{N}_\-/]*[\p{L}_\-][\p{L}\p{N}_\-/]*)/gmu;
export function tags(text: string): Tag[] {
  const out: Tag[] = [];
  for (const m of uncode(text).matchAll(TAG)) {
    const from = m.index! + m[1]!.length;
    out.push({ from, to: from + 1 + m[2]!.length, tag: m[2]!.replace(/\/+$/, "").toLowerCase() });
  }
  return out;
}

// A wikilink target: the note with that exact name, else the first (by name) whose
// last segment matches, ignoring case, as Obsidian resolves `[[Standup]]` to `Work/Standup`.
export function resolve(name: string, names: string[]): string | null {
  const n = name.trim().replace(/\.md$/i, "").toLowerCase();
  const exact = names.find((x) => x.toLowerCase() === n);
  if (exact) return exact;
  return [...names].sort().find((x) => x.toLowerCase().split("/").pop() === n) ?? null;
}

// The only URLs a note may open or embed: web, mail, and relative paths. Everything
// else (javascript:, data:, vbscript:, file:) is null and the page leaves it as text.
export function safeUrl(u: string): string | null {
  const s = u.trim();
  if (!s || /[\x00-\x1f]/.test(s)) return null;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(s);
  if (!scheme) return s.startsWith("//") ? null : s;
  return ["http", "https", "mailto"].includes(scheme[1]!.toLowerCase()) ? s : null;
}

// The sidebar's tree: folders first, then notes, each by name.
export type Tree = { folders: Map<string, Tree>; notes: string[] };
export function tree(names: string[]): Tree {
  const root: Tree = { folders: new Map(), notes: [] };
  for (const name of names) {
    const parts = name.split("/");
    let t = root;
    for (const p of parts.slice(0, -1)) {
      if (!t.folders.has(p)) t.folders.set(p, { folders: new Map(), notes: [] });
      t = t.folders.get(p)!;
    }
    t.notes.push(name);
  }
  const sort = (t: Tree): Tree => ({
    folders: new Map([...t.folders].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sort(v)])),
    notes: t.notes.sort((a, b) => a.localeCompare(b)),
  });
  return sort(root);
}

// A name unused so far: `Untitled`, `Untitled 2`, … in the folder asked for.
export function freshName(names: string[], folder = "", base = "Untitled") {
  const taken = new Set(names.map((n) => n.toLowerCase()));
  const at = (n: string) => (folder ? folder + "/" : "") + n;
  for (let i = 1; ; i++) { const n = at(i === 1 ? base : `${base} ${i}`); if (!taken.has(n.toLowerCase())) return n; }
}

// A GFM table's source as cells: the header row, each column's alignment from the
// delimiter row, and the body rows padded to the header's width. `\|` stays a pipe.
export type Table = { head: string[]; align: ("left" | "center" | "right" | "")[]; rows: string[][] };
export function parseTable(src: string): Table {
  const cells = (l: string) => l.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
  const lines = src.split(/\r?\n/).filter((l) => l.trim());
  const head = cells(lines[0] ?? "");
  const align = cells(lines[1] ?? "").map((d) => d.startsWith(":") && d.endsWith(":") ? "center" : d.endsWith(":") ? "right" : d.startsWith(":") ? "left" : "") as Table["align"];
  const rows = lines.slice(2).map((l) => { const r = cells(l); return head.map((_, i) => r[i] ?? ""); });
  return { head, align, rows };
}
