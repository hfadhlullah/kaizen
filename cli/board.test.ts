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

// A building run's progress list, lifted the same way.
const pat = html.indexOf("function progress(");
const progress = new Function(`${esc}\n${html.slice(pat, html.indexOf("\n\n", pat))}\nreturn progress`)() as (src: string, prev?: string[]) => string;

test("progress: each item marked done, working on or to do, with the count", () => {
  const out = progress("# Progress\n- done: one\n- doing: two <b>x</b>\n- todo: `three`\n- open: not an item\n");
  expect(out).toContain("1 of 3 done");
  expect(out).toContain("width:33%");
  expect(out.match(/<li class="p-(\w+)/g)).toEqual(['<li class="p-done', '<li class="p-doing', '<li class="p-todo']);
  expect(out).toContain("two &lt;b&gt;x&lt;/b&gt;");
  expect(out).toContain("<code>three</code>");
  expect(out).not.toContain("chg");
});

test("progress: only an item whose status moved animates", () => {
  const out = progress("- done: one\n- doing: two\n- todo: three\n", ["done", "todo", "todo"]);
  expect(out.match(/<li class="[^"]*"/g)).toEqual(['<li class="p-done"', '<li class="p-doing chg"', '<li class="p-todo"']);
});

test("progress: a file with no items draws nothing", () => {
  expect(progress("# Progress\n\nnothing yet\n")).toBe("");
});

// A plan's open questions, lifted the same way: the function ends at the first line not indented.
const pq = html.indexOf("function planQuestions(");
type Q = { q: string; multi: boolean; options: { text: string; label: string; rec: boolean }[] };
const planQuestions = new Function(`${html.slice(pq).split(/\n(?! )/)[0]}\nreturn planQuestions`)() as (src: string) => Q[] | null;

test("planQuestions: Q lines with options, recommended and multi-select read", () => {
  const qs = planQuestions(`# Plan\n## 9. Open questions\n\nQ: Which improvements to build? (multi-select)\n   - Own project in row (recommended) — fixes Move; XS\n   - Gather on add — instant result\nQ: Where the progress shows\n   - Top of the Backlog tab (recommended): what you asked for.\n   - Its own tab: adds an eighth tab\n\n- Note: not an option\n## 10. Out of scope suggestions\n- not a question\n`);
  expect(qs!.map((q) => [q.q, q.multi])).toEqual([["Which improvements to build? (multi-select)", true], ["Where the progress shows", false]]);
  expect(qs[0]!.options.map((o) => [o.label, o.rec])).toEqual([["Own project in row", true], ["Gather on add", false]]);
  expect(qs[1]!.options.map((o) => o.label)).toEqual(["Top of the Backlog tab", "Its own tab"]);
});

test("planQuestions: fenced and numbered questions, sub-headings kept, none and missing read as nothing", () => {
  const qs = planQuestions("## Open questions\n### Board\n```\nQ1: How should it run?\n   - Detach (recommended): prompt comes back\n   - Foreground: as is\n```\n");
  expect(qs!.map((q) => [q.q, q.options.length])).toEqual([["How should it run?", 2]]);
  expect(planQuestions("## 9. Open questions\n\nNone.\n")).toEqual([]);
  expect(planQuestions("## 9. Open questions\n- Building → Backlog taken literally.\n")).toBeNull();
  expect(planQuestions("# Plan\nno section\n")).toEqual([]);
});

test("planQuestions: a bullet after a blank line is not one more option", () => {
  const qs = planQuestions("## Open questions\nQ: One?\n   - A (recommended)\n   - B\n\n- Note: aside\n")!;
  expect(qs[0]!.options.map((o) => o.label)).toEqual(["A", "B"]);
});

test("card menu items: appropriate actions and distinct icons across phases", () => {
  expect(html).toContain('<symbol id="i-open"');
  expect(html).toContain('<symbol id="i-archive"');
  expect(html).toContain('<symbol id="i-restore"');

  const ico = (n: string) => `<svg><use href="#i-${n}"/></svg>`;
  const menuSnippet = (html.slice(html.indexOf("if(k===menuKey){"), html.indexOf("el.innerHTML+=`<div class=\"menu-pop\"", html.indexOf("if(k===menuKey){"))) + "}").replace("const items=[];", "items=[];");
  const getItems = new Function("c", "archive", `const ico = ${ico.toString()};\nlet k = 1, menuKey = 1, items = [];\n${menuSnippet}\nreturn items;`);

  // Phase 0: Ideas (idea card)
  const idea = { kind: "idea", status: "idea", column: 0 };
  const ideaItems = getItems(idea, false);
  expect(ideaItems.map((i: any) => i ? i[1] : null)).toEqual(["Run", "Edit", "Archive", null, "Reject", "Delete"]);
  expect(ideaItems[0][2]).toBe(ico("play"));
  expect(ideaItems[1][2]).toBe(ico("pen"));
  expect(ideaItems[2][2]).toBe(ico("archive"));
  expect(ideaItems[4][2]).toBe(ico("x"));
  expect(ideaItems[5][2]).toBe(ico("trash"));

  // Phase 1: Planning (starting idea)
  const startingIdea = { kind: "idea", status: "starting", column: 1 };
  const startItems = getItems(startingIdea, false);
  expect(startItems.map((i: any) => i ? i[1] : null)).toEqual(["Open", "Run again", "Archive", null, "Remove"]);

  // Phase 1: Planning (run waiting for plan approval)
  const planWaiting = { kind: "run", status: "waiting", awaiting: "approvals.plan", column: 1 };
  const planItems = getItems(planWaiting, false);
  expect(planItems.map((i: any) => i ? i[1] : null)).toEqual(["Review plan", "Archive", null, "Abandon"]);
  expect(planItems[0][2]).toBe(ico("open"));
  expect(planItems[1][2]).toBe(ico("archive"));
  expect(planItems[3][2]).toBe(ico("x"));

  // Phase 2: Building (running run)
  const buildingRun = { kind: "run", status: "running", column: 2 };
  const buildItems = getItems(buildingRun, false);
  expect(buildItems.map((i: any) => i ? i[1] : null)).toEqual(["Open", "Archive", null, "Abandon"]);

  // Phase 3: Review (run waiting for review approval)
  const reviewWaiting = { kind: "run", status: "waiting", awaiting: "approvals.review", column: 3 };
  const reviewItems = getItems(reviewWaiting, false);
  expect(reviewItems.map((i: any) => i ? i[1] : null)).toEqual(["Review work", "Archive", null, "Abandon"]);

  // Phase 3: Review (run waiting on findings)
  const findingsWaiting = { kind: "run", status: "waiting", awaiting: "findings", column: 3 };
  const findingsItems = getItems(findingsWaiting, false);
  expect(findingsItems.map((i: any) => i ? i[1] : null)).toEqual(["See findings", "Archive", null, "Abandon"]);

  // Phase 4: Done (done run - no Abandon)
  const doneRun = { kind: "run", status: "done", column: 4 };
  const doneItems = getItems(doneRun, false);
  expect(doneItems.map((i: any) => i ? i[1] : null)).toEqual(["Open", "Archive"]);

  // Phase 4: Done (abandoned run - no Abandon)
  const abandonedRun = { kind: "run", status: "abandoned", column: 4 };
  const abandItems = getItems(abandonedRun, false);
  expect(abandItems.map((i: any) => i ? i[1] : null)).toEqual(["Open", "Archive"]);

  // Archive view
  const archRun = getItems(doneRun, true);
  expect(archRun.map((i: any) => i ? i[1] : null)).toEqual(["Restore", "Open"]);
  expect(archRun[0][2]).toBe(ico("restore"));
  expect(archRun[1][2]).toBe(ico("open"));

  const archIdea = getItems(idea, true);
  expect(archIdea.map((i: any) => i ? i[1] : null)).toEqual(["Restore", "Open", null, "Delete"]);
});
