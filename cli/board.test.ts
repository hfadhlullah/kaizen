// The board's markdown renderer, lifted out of web/board.html and run as it ships.
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const html = readFileSync(join(dirname(import.meta.dir), "web", "board.html"), "utf8");
const esc = html.match(/^const esc=.*$/m)![0];
const at = html.indexOf("function md(");
const md = new Function(`${esc}\n${html.slice(at, html.indexOf("\n\n", at))}\nreturn md`)() as (src: string, tick?: boolean) => string;

test("backlog items: a checkbox each, ticked only when done", () => {
  const out = md('- open: one | why\n- done: two <b>x</b> | fixed\n- rejected: three | no\n- plain\n', true);
  const boxes = out.match(/<li[^>]*>.*?<\/li>/g)!;
  expect(boxes.length).toBe(4);
  expect(boxes.map(b => / checked/.test(b))).toEqual([false, true, false, false]);
  expect(boxes[2]).toContain('class="tk rej"');
  expect(boxes[1]).toContain("two &lt;b&gt;x&lt;/b&gt; | fixed");
  expect(boxes[1]).toContain('aria-disabled="true"');
  expect(boxes[3]).toBe("<li>plain</li>");
});

test("without the flag a backlog line is an ordinary list item", () => {
  expect(md("- done: two\n")).toBe("<ul><li>done: two</li></ul>");
});

// draft()/undraft() lifted the same way, against a stub sessionStorage whose keys are its own properties.
const store = () => Object.defineProperties({} as Record<string, string>, {
  getItem: { value(k: string) { return k in this ? this[k] : null; } },
  setItem: { value(k: string, v: string) { this[k] = String(v); } },
  removeItem: { value(k: string) { delete this[k]; } },
});
const line = (re: RegExp) => html.match(re)![0];
const drafts = (ss: object) => new Function("sessionStorage",
  `${line(/^const DK=.*$/m)}\n${line(/^function draft\(.*$/m)}\n${line(/^function undraft\(.*$/m)}\nreturn {draft,undraft}`)(ss) as
  { draft: (el: any, k: string) => void; undraft: (p: string) => void };
const field = (value = "") => ({ value, on: () => {}, addEventListener(_: string, f: () => void) { this.on = f; } });

test("a draft is saved on input and restored into a rebuilt field", () => {
  const ss = store(), { draft } = drafts(ss);
  const a = field("from server");
  draft(a, "f:new:0");
  expect(a.value).toBe("from server");
  a.value = "half typed"; a.on();
  expect(ss["kz-d:f:new:0"]).toBe("half typed");
  const b = field("from server");
  draft(b, "f:new:0");
  expect(b.value).toBe("half typed");
});

test("undraft removes by prefix and leaves the rest", () => {
  const ss = store(), { undraft } = drafts(ss);
  Object.assign(ss, { "kz-d:f:new:0": "a", "kz-d:f:edit:x:1": "b", "kz-d:n:x": "note", "kz-form": "null" });
  undraft("f:");
  expect(Object.keys(ss).sort()).toEqual(["kz-d:n:x", "kz-form"]);
});
