// The notebook: file safety in cli/notes.ts, the text rules in web/notes-lib.ts, and
// the two things that drift silently — the copied design tokens and the committed bundle.
import { test, expect, beforeEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, utimesSync, symlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { safeName, listNotes, saveNote, renameNote, deleteNote } from "./notes.ts";
import { wikilinks, tags, resolve, safeUrl, tree, uncode, freshName, parseTable } from "../web/notes-lib.ts";
import { sourceHash, OUT } from "./build-web.ts";

let state = "";
beforeEach(() => { state = join(mkdtempSync(join(tmpdir(), "kaizen-notes-")), ".kaizen"); mkdirSync(state); });
const root = dirname(import.meta.dir);

test("safeName: folders allowed, nothing that leaves notes/", () => {
  expect(safeName("Work/Standup")).toBe("Work/Standup");
  expect(safeName("  Idea.md ")).toBe("Idea");
  expect(safeName(" a / b ")).toBe("a/b");
  for (const bad of ["", "../x", "a/../../b", ".hidden", "a/.b", "/etc/passwd", "a\\b", "C:x", "a//b", "a/", "x\ny", "1/2/3/4/5/6/7", "x".repeat(121), 7, null])
    expect(safeName(bad as string)).toBeNull();
});

test("every write route refuses a name outside notes/, and writes nothing", () => {
  for (const bad of ["../escape", "a/../../escape", "/tmp/escape"]) {
    expect(saveNote(state, bad, "x", 0)).toEqual({ ok: false, why: "bad name" });
    expect(renameNote(state, bad, "ok")).toBe("bad name");
    expect(deleteNote(state, bad)).toBe("bad name");
  }
  saveNote(state, "ok", "x", 0);
  expect(renameNote(state, "ok", "../../escape")).toBe("bad name");
  expect(readdirSync(dirname(state)).sort()).toEqual([".kaizen"]);
  expect(readdirSync(state)).toEqual(["notes"]);
});

test("save: creates folders, then refuses a stale base and returns what is on disk", () => {
  const a = saveNote(state, "Work/Standup", "one", 0);
  expect(a.ok).toBe(true);
  if (!a.ok) return;
  expect(readFileSync(join(state, "notes", "Work", "Standup.md"), "utf8")).toBe("one");
  // Created twice: the second is a conflict, not an overwrite.
  expect(saveNote(state, "Work/Standup", "again", 0).ok).toBe(false);
  // Someone else writes it.
  const f = join(state, "notes", "Work", "Standup.md");
  writeFileSync(f, "theirs"); utimesSync(f, new Date(), new Date(Date.now() + 5000));
  const c = saveNote(state, "Work/Standup", "mine", a.mtime);
  expect(c).toMatchObject({ ok: false, why: "conflict", text: "theirs" });
  expect(readFileSync(f, "utf8")).toBe("theirs");
  // Saving over what is there now works.
  if (!c.ok && c.mtime) expect(saveNote(state, "Work/Standup", "mine", c.mtime).ok).toBe(true);
  expect(readFileSync(f, "utf8")).toBe("mine");
  // A note deleted elsewhere, saved with an old base: a conflict with nothing there.
  expect(saveNote(state, "Gone", "x", 123)).toMatchObject({ ok: false, why: "conflict", text: "" });
});

test("save keeps the text byte for byte, CRLF included", () => {
  const text = "# T\r\n\r\n- [ ] a\r\n\ttab  \r\n";
  saveNote(state, "crlf", text, 0);
  expect(readFileSync(join(state, "notes", "crlf.md"), "utf8")).toBe(text);
});

test("list: recursive, newest first, dot folders skipped", () => {
  saveNote(state, "a", "A", 0);
  saveNote(state, "Work/b", "B", 0);
  const later = join(state, "notes", "Work", "b.md"); utimesSync(later, new Date(), new Date(Date.now() + 5000));
  mkdirSync(join(state, "notes", ".obsidian")); writeFileSync(join(state, "notes", ".obsidian", "x.md"), "no");
  writeFileSync(join(state, "notes", "skip.txt"), "no");
  expect(listNotes(state).map((n) => n.name)).toEqual(["Work/b", "a"]);
  expect(listNotes(join(state, "nothing"))).toEqual([]);
});

test("list: only names the notebook can save back; a symlinked folder once, never a loop", () => {
  const n = join(state, "notes");
  saveNote(state, "ok", "x", 0);
  writeFileSync(join(n, "What?.md"), "x");
  writeFileSync(join(n, "a: b.md"), "x");
  mkdirSync(join(n, "1/2/3/4/5/6"), { recursive: true }); writeFileSync(join(n, "1/2/3/4/5/6/deep.md"), "x");
  mkdirSync(join(n, "trail ")); writeFileSync(join(n, "trail ", "x.md"), "x");
  symlinkSync("..", join(n, "up"));
  expect(listNotes(state).map((x) => x.name)).toEqual(["ok"]);
});

test("rename moves between folders, refuses to clobber, prunes the emptied folder", () => {
  saveNote(state, "Old/x", "X", 0);
  saveNote(state, "y", "Y", 0);
  expect(renameNote(state, "Old/x", "y")).toBe("a note with that name exists");
  expect(renameNote(state, "nope", "z")).toBe("no such note");
  expect(renameNote(state, "Old/x", "New/Deep/x")).toBeNull();
  expect(existsSync(join(state, "notes", "Old"))).toBe(false);
  expect(readFileSync(join(state, "notes", "New", "Deep", "x.md"), "utf8")).toBe("X");
});

test("delete moves to .trash, never unlinks", () => {
  saveNote(state, "F/gone", "keep me", 0);
  expect(deleteNote(state, "F/gone")).toBeNull();
  expect(deleteNote(state, "F/gone")).toBe("no such note");
  const trash = readdirSync(join(state, "notes", ".trash"));
  expect(trash.length).toBe(1);
  expect(trash[0]).toEndWith("-F~gone.md");
  expect(readFileSync(join(state, "notes", ".trash", trash[0]!), "utf8")).toBe("keep me");
  expect(existsSync(join(state, "notes", "F"))).toBe(false);
  expect(listNotes(state)).toEqual([]);
});

test("wikilinks: plain, labelled, anchored; none inside code", () => {
  const t = "See [[Alpha]] and [[Work/Beta|the beta]] and [[Gamma#Part]].\n`[[not]]`\n```\n[[nor]]\n```\n";
  const w = wikilinks(t);
  expect(w.map((x) => [x.name, x.label])).toEqual([["Alpha", "Alpha"], ["Work/Beta", "the beta"], ["Gamma", "Gamma#Part"]]);
  expect(t.slice(w[1]!.from, w[1]!.to)).toBe("[[Work/Beta|the beta]]");
  // uncode keeps offsets: blanked text is the same length.
  expect(uncode(t).length).toBe(t.length);
});

test("tags: words after a space or at line start; not headings, numbers, urls or code", () => {
  const t = "#plan and #Work/Q3 here\n# Heading\nissue #12 x#y http://a.b/#frag\n`#code`\n(#paren)";
  expect(tags(t).map((x) => x.tag)).toEqual(["plan", "work/q3", "paren"]);
});

test("indented code is code: no tags or wikilinks in it; list continuations still count", () => {
  const t = "Para #one\n\n    #include <x>\n    [[inCode]]\n\n\tmore #nottag\n\nback #two\n- item\n    #three [[Cont]]\n";
  expect(tags(t).map((x) => x.tag)).toEqual(["one", "two", "three"]);
  expect(wikilinks(t).map((x) => x.name)).toEqual(["Cont"]);
  expect(uncode(t).length).toBe(t.length);
});

test("resolve: exact name first, then by last segment, ignoring case", () => {
  const names = ["Work/Standup", "Home/Standup", "Alpha"];
  expect(resolve("alpha", names)).toBe("Alpha");
  expect(resolve("Work/Standup", names)).toBe("Work/Standup");
  expect(resolve("standup", names)).toBe("Home/Standup");
  expect(resolve("Nope", names)).toBeNull();
});

test("safeUrl: web, mail and relative only", () => {
  for (const ok of ["https://x.dev", "http://x", "mailto:a@b.c", "Other note.md", "img/a.png", "#part"]) expect(safeUrl(ok)).toBe(ok);
  for (const bad of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,x", "vbscript:x", "file:///etc/passwd", "//evil.com/x", "java\tscript:x", ""])
    expect(safeUrl(bad)).toBeNull();
});

test("parseTable: header, alignment, rows padded, escaped pipes kept", () => {
  expect(parseTable("| A | B | C |\n|:--|:-:|--:|\n| 1 | a \\| b |\n|2|3|4|5|\n")).toEqual({
    head: ["A", "B", "C"], align: ["left", "center", "right"], rows: [["1", "a | b", ""], ["2", "3", "4"]],
  });
  expect(parseTable("A | B\r\n--- | ---\r\nx | y").rows).toEqual([["x", "y"]]);
});

test("tree and freshName", () => {
  const tr = tree(["b", "Z/c", "A/x", "A/B/y", "a2"]);
  expect([...tr.folders.keys()]).toEqual(["A", "Z"]);
  expect(tr.notes).toEqual(["a2", "b"]);
  expect([...tr.folders.get("A")!.folders.keys()]).toEqual(["B"]);
  expect(freshName(["Untitled", "untitled 2"])).toBe("Untitled 3");
  expect(freshName(["Untitled"], "Work")).toBe("Work/Untitled");
});

test("the notebook's design tokens are the board's, line for line", () => {
  const block = (f: string) => {
    const s = readFileSync(join(root, "web", f), "utf8").split("\n");
    const at = s.findIndex((l) => l.startsWith(":root{--bg:"));
    return s.slice(at, at + 8).join("\n");
  };
  expect(block("notes.html")).toBe(block("board.html"));
  expect(block("board.html")).toContain("data-theme=dark]{--shade");
  const mascot = (f: string) => readFileSync(join(root, "web", f), "utf8").split("\n").find((l) => l.startsWith(".mascot{"));
  expect(mascot("notes.html")).toBe(mascot("board.html")!);
});

test("web/notebook.js was built from the sources as they are (bun run build:web)", () => {
  const first = readFileSync(OUT, "utf8").split("\n", 1)[0]!;
  expect(first).toContain(`kaizen notebook ${sourceHash()} `);
});
