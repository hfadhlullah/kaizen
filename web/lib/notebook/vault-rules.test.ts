import { expect, test } from "bun:test";
import {
  age,
  backlinks,
  folderOf,
  last,
  parseQuery,
  renameMessage,
  renameTarget,
  searchNotes,
  startNote,
  tagCounts,
  toggleTag,
  type Note,
} from "./vault-rules.ts";
import { freshName, tree } from "./text.ts";

const n = (name: string, text = "", mtime = 0): Note => ({ name, text, mtime });

test("last and folderOf split a name at its last slash", () => {
  expect([last("A/B/C"), folderOf("A/B/C"), last("Top"), folderOf("Top")]).toEqual(["C", "A/B", "Top", ""]);
});

test("rename: trims, drops .md and spaces around slashes, and does nothing for an empty or unchanged name", () => {
  expect(renameTarget("Old", "  New ")).toBe("New");
  expect(renameTarget("Old", "Work / Standup.MD")).toBe("Work/Standup");
  expect(renameTarget("Old", "")).toBeNull();
  expect(renameTarget("Old", "  ")).toBeNull();
  expect(renameTarget("Old", "Old ")).toBeNull();
});
test("rename message: Renamed in the same folder, Moved to a folder or the top across folders", () => {
  expect(renameMessage("A/x", "A/y")).toBe("Renamed");
  expect(renameMessage("x", "A/x")).toBe("Moved to A");
  expect(renameMessage("A/B/x", "x")).toBe("Moved to the top");
});

test("search: words match name or text, a #tag matches its children, order is the list's, empty keeps all", () => {
  const notes = [
    n("Alpha", "talks about beta"),
    n("Beta", "#work/standup notes"),
    n("Gamma", "#work later"),
    n("Delta", "#workshop"),
  ];
  const names = (q: string) => searchNotes(notes, parseQuery(q)).map((x) => x.name);
  expect(names("")).toEqual(["Alpha", "Beta", "Gamma", "Delta"]);
  expect(names("BETA")).toEqual(["Alpha", "Beta"]);
  expect(names("#work")).toEqual(["Beta", "Gamma"]); // not #workshop
  expect(names("#work/standup")).toEqual(["Beta"]);
  expect(names("#nothing")).toEqual([]);
  expect(parseQuery("  #Work ")).toEqual({ text: "#work", tag: "work" });
  expect(parseQuery("x").tag).toBeNull();
});

test("tags: counted once per note, most used first, ties by name; the chip toggles the search", () => {
  const notes = [n("a", "#b #a #a"), n("b", "#a #c"), n("c", "no tags here")];
  expect(tagCounts(notes)).toEqual([
    ["a", 2],
    ["b", 1],
    ["c", 1],
  ]);
  expect(toggleTag("", "a")).toBe("#a");
  expect(toggleTag("#a", "a")).toBe("");
  expect(toggleTag("#b", "a")).toBe("#a");
});

test("backlinks: notes that link to this one by name or by last segment, never itself", () => {
  const notes = [
    n("Work/Standup", "[[Standup]] itself"),
    n("Plan", "see [[Standup]]"),
    n("Other", "[[Plan]] and `[[Standup]]`"),
  ];
  expect(backlinks(notes, "Work/Standup").map((x) => x.name)).toEqual(["Plan"]);
  expect(backlinks(notes, "Plan").map((x) => x.name)).toEqual(["Other"]);
});

test("age: now, minutes, hours, days", () => {
  const t = 1_000_000_000_000;
  expect([0, 59, 60, 3599, 3600, 86399, 86400, 3 * 86400].map((s) => age(t - s * 1000, t))).toEqual([
    "now",
    "now",
    "1m",
    "59m",
    "1h",
    "23h",
    "1d",
    "3d",
  ]);
});

test("the note opened at start: ?note= wins when it exists, else the one kept, else none", () => {
  const names = ["A", "B"];
  expect(startNote(names, "B", "A")).toBe("B");
  expect(startNote(names, "Gone", "A")).toBe("A");
  expect(startNote(names, null, "Gone")).toBeNull();
  expect(startNote(names, null, null)).toBeNull();
});

test("the tree puts folders first, sorted, and a new note's name is unused in its folder", () => {
  const t = tree(["b", "a", "F/z", "F/G/y", "E/x"]);
  expect([...t.folders.keys()]).toEqual(["E", "F"]);
  expect(t.notes).toEqual(["a", "b"]);
  expect([...t.folders.get("F")!.folders.keys()]).toEqual(["G"]);
  expect(freshName(["Untitled", "Untitled 2"])).toBe("Untitled 3");
  expect(freshName(["F/Untitled"], "F")).toBe("F/Untitled 2");
  expect(freshName(["Untitled"], "F")).toBe("F/Untitled");
});
