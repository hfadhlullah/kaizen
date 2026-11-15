import { expect, test } from "bun:test";
import { attach } from "@lib/markdown";
import { descParts, noteBody, noteKey, parseNotes, pretty } from "./notes.ts";
import { addNoteFiles, clearNoteFiles, getNotes } from "./notes-store.ts";

test("a notes file is one message per stamp, with indented lines folded into the message above", () => {
  const n = parseNotes("[2026-11-01 10:00] first\n  second line\n[2026-11-01 10:05] next\n\n");
  expect(n).toEqual([
    { at: "2026-11-01 10:00", text: "first\nsecond line" },
    { at: "2026-11-01 10:05", text: "next" },
  ]);
  expect(parseNotes("loose text\n[2026-11-01 10:00] a")).toEqual([
    { at: "", text: "loose text" },
    { at: "2026-11-01 10:00", text: "a" },
  ]);
  expect(parseNotes(undefined)).toEqual([]);
  expect(parseNotes("[2026-11-01 10:00]   ")).toEqual([]);
});

// pretty(): a one-line task note splits into one paragraph per label.
test("pretty() gives a labelled line one paragraph per label and leaves markdown alone", () => {
  const t = "Parent: run-x add a timezone. OPEN QUESTION (waiting on Johan): recalc old rows? Context: PR #452.";
  expect(pretty(t)).toBe(
    "**Parent:** run-x add a timezone.\n\n**OPEN QUESTION (waiting on Johan):** recalc old rows?\n\n**Context:** PR #452.",
  );
  expect(pretty("just a note")).toBe("just a note");
  expect(pretty("Goal: a\nScope: b")).toBe("Goal: a\nScope: b");
  expect(pretty("Parent: x\ndo y. NOTE: a. Context: b.")).toBe("Parent: x\n\ndo y.\n\n**NOTE:** a.\n\n**Context:** b.");
  expect(pretty("- Goal: a. Scope: b.")).toBe("- Goal: a. Scope: b.");
  expect(pretty("```\nGoal: a. Scope: b.\n```")).toBe("```\nGoal: a. Scope: b.\n```");
});

test("a task's labelled request shows as sections; a run has none", () => {
  const text = "Fix x. Problem: it breaks. Scope: one file.";
  expect(descParts({ kind: "idea", state: "/p", text })).toBe("### Problem\nit breaks.\n\n### Scope\none file.");
  expect(descParts({ kind: "idea", state: "/p", text: "plain" })).toBe("");
  expect(descParts({ kind: "run", state: "/p", id: "r1", text })).toBe("");
});

test("a note is posted by run id for a run and by request text for a task", () => {
  const f = [{ name: "a.png", data: "data:x" }];
  expect(noteBody({ kind: "run", state: "/p", id: "r1" }, "hi", f)).toEqual({
    dir: "/p",
    id: "r1",
    text: "hi",
    files: f,
  });
  expect(noteBody({ kind: "idea", state: "/p", text: "do it" }, "hi", [])).toEqual({
    dir: "/p",
    for: "do it",
    text: "hi",
    files: [],
  });
});

test("a card's key is its _k, else kind, project and id or text", () => {
  expect(noteKey({ _k: "k1", kind: "run", state: "/p", id: "r" })).toBe("k1");
  expect(noteKey({ kind: "run", state: "/p", id: "r" })).toBe("run:/p:r");
  expect(noteKey({ kind: "idea", state: "/p", text: "t" })).toBe("idea:/p:t");
});

test("attachment links point at /file, other relative links show as their path", () => {
  const run = { kind: "run", state: "/p q", id: "r1" };
  expect(attach("![s](attachments/a.png)", run)).toBe("![s](/file?dir=%2Fp%20q&p=runs%2Fr1%2Fattachments%2Fa.png)");
  expect(attach("[x](attachments/a.png)", { kind: "idea", state: "/p" })).toBe(
    "[x](/file?dir=%2Fp&p=attachments%2Fa.png)",
  );
  expect(attach("[v](../v.mp4)", run)).toBe("v (`../v.mp4`)");
  expect(attach("[w](https://a.b) [h](#x) [r](/y)", run)).toBe("[w](https://a.b) [h](#x) [r](/y)");
});

test("files picked for a card are kept per card until it is sent", () => {
  const a = new File(["1"], "a.txt"),
    b = new File(["2"], "b.txt");
  addNoteFiles("k1", [a]);
  addNoteFiles("k1", [b]);
  addNoteFiles("k2", [a]);
  expect(getNotes().files.k1.map((f) => f.name)).toEqual(["a.txt", "b.txt"]);
  clearNoteFiles("k1");
  expect(getNotes().files.k1).toBeUndefined();
  expect(getNotes().files.k2).toHaveLength(1);
  clearNoteFiles("k2");
});
