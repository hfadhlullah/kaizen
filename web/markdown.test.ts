import { expect, test } from "bun:test";
import { md } from "./board/markdown.ts";
import { inline, parse } from "./lib/markdown.ts";

test("blocks: headings cap at 3, fences keep their text, rules, tables drop the divider row", () => {
  const b = parse("# One\n#### Four\n```\nx < y\n```\n---\n| a | b |\n|---|---|\n| 1 | 2 |");
  expect(b.map((x) => x.k)).toEqual(["h", "h", "pre", "hr", "table"]);
  expect(b.filter((x) => x.k === "h").map((x: any) => x.level)).toEqual([1, 3]);
  expect((b[2] as any).t).toBe("x < y");
  expect((b[4] as any).rows).toHaveLength(1);
});

test("lists: a kind change or a blank line starts a new list", () => {
  expect(parse("- a\n- b\n1. c").map((x: any) => [x.k, x.ordered, x.items.length])).toEqual([
    ["list", false, 2],
    ["list", true, 1],
  ]);
  expect(parse("- a\n\n- b").filter((x) => x.k === "list")).toHaveLength(2);
});

test("a paragraph joins its lines with a space and breaks after two trailing spaces", () => {
  const p = parse("one\ntwo  \nthree")[0] as any;
  expect(p.lines.map((l: any) => l.join(""))).toEqual(["one two", "three"]);
});

test("inline: code, bold, italic, nesting in a link, unsafe addresses stay text", () => {
  expect(inline("a `b` **c** *d*")).toEqual(["a ", { k: "code", t: "b" }, " ", { k: "b", c: ["c"] }, " ", { k: "i", c: ["d"] }]);
  expect(inline("[**go**](https://x.test)")).toEqual([{ k: "a", href: "https://x.test", c: [{ k: "b", c: ["go"] }] }]);
  expect(inline("[x](javascript:alert(1))").join("")).toBe("[x](javascript:alert(1))");
  expect(inline("![pic](data:text/html,x)")).toEqual(["![pic](data:text/html,x)"]);
  expect(inline("![pic](/file?p=a.png)")).toEqual([{ k: "img", src: "/file?p=a.png", alt: "pic" }]);
});

test("it reads the same text as the old md(): the same words in the same order", () => {
  const src = "# T\n\nSome **bold** and `code` text.\n\n- one\n- two\n\n1. first\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```\nraw\n```";
  const text = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const flat = (x: any): string =>
    typeof x === "string" ? x : Array.isArray(x) ? x.map(flat).join(" ") : x.t ?? flat(x.c ?? x.items ?? x.lines ?? [...(x.head ?? []), ...(x.rows ?? [])]);
  expect(parse(src).map(flat).join(" ").replace(/\s+/g, " ")).toBe(text(md(src)));
});
