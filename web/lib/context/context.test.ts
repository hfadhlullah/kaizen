import { expect, test } from "bun:test";
import {
  contextTitle,
  entryLabel,
  entryPath,
  noteHref,
  noteIndent,
  parentOf,
  sessionLabel,
  sortNotes,
  textUrl,
  treeUrl,
} from "./context-rules.ts";

test("the title is the project's folder; notes indent one step per folder, at most four", () => {
  expect(contextTitle("/home/me/app/.kaizen")).toBe("app");
  expect(contextTitle("C:\\work\\app\\.kaizen")).toBe("app");
  expect(contextTitle("")).toBe("Project");
  expect(noteIndent("a")).toBe(8);
  expect(noteIndent("a/b/c")).toBe(28);
  expect(noteIndent("a/b/c/d/e/f/g")).toBe(48);
  expect(sortNotes([{ name: "b" }, { name: "a/x" }]).map((n) => n.name)).toEqual(["a/x", "b"]);
});

test("rows, paths and addresses", () => {
  expect(entryLabel({ name: "src", dir: true })).toBe("▸ src");
  expect(entryLabel({ name: "a.ts" })).toBe("   a.ts");
  expect(entryPath("", { name: "src" })).toBe("src");
  expect(entryPath("src/lib", { name: "a.ts" })).toBe("src/lib/a.ts");
  expect(parentOf("src/lib")).toBe("src");
  expect(parentOf("src")).toBe("");
  expect(treeUrl("/p/.kaizen", "src")).toBe("/project-tree?dir=%2Fp%2F.kaizen&path=src");
  expect(textUrl("/p", "a b.md", true)).toBe("/project-text?dir=%2Fp&path=a%20b.md&download=1");
  expect(noteHref("/p", "a/b")).toBe("/notebook?dir=%2Fp&note=a%2Fb");
  expect(sessionLabel({ id: "run-1", pty: { alive: true } })).toBe("● run-1");
  expect(sessionLabel({ text: "hello\nworld", pty: { alive: false } })).toBe("○ hello");
});
