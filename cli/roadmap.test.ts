import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nextPhase, parsePhase, parseRoadmap, roadmapCommand, type Roadmap } from "./roadmap.ts";

const book = `# Write my novel

## Phases
1. [done] Outline — chapter plan — verify: the author approves it — run: 2026-11-01-outline
2. [todo] First draft — all chapters — verify: reads end to end — after: #1
3. [blocked] Print — the printed book — verify: a proof copy — after: #2
4. [todo] Launch — tell readers — verify: the post is live — after: #2, #3

## Decisions
- First person, past tense
`;
const parse = (t: string) => parseRoadmap("book", "book.md", t) as Roadmap;

function withRoadmaps(files: Record<string, string>, fn: (state: string) => void) {
  const state = mkdtempSync(join(tmpdir(), "kaizen-roadmap-"));
  try {
    mkdirSync(join(state, "roadmaps"));
    for (const [n, t] of Object.entries(files)) writeFileSync(join(state, "roadmaps", `${n}.md`), t);
    fn(state);
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
}

test("a phase line reads in any track, and a dash in the title does not split it", () => {
  const p = parsePhase("2. [todo] Pack - kitchen first — boxes labelled — verify: nothing left — after: #1");
  expect(p).toMatchObject({ n: 2, status: "todo", title: "Pack - kitchen first", goal: "boxes labelled", verify: "nothing left", after: [1] });
  expect(parsePhase("just text")).toBeNull();
});

test("the next phase respects order, dependencies and blocks", () => {
  const r = parse(book);
  expect(r.decisions).toEqual(["First person, past tense"]);
  expect(nextPhase(r)?.n).toBe(2);
  const later = parse(book.replace("2. [todo]", "2. [done]"));
  expect(nextPhase(later)).toBeNull(); // 3 is blocked, 4 waits on 3
});

test("a phase in progress is resumed before anything else", () => {
  expect(nextPhase(parse(book.replace("4. [todo]", "4. [doing]")))?.n).toBe(4);
});

test("a malformed roadmap is an error, never a crash", () => {
  expect(parseRoadmap("x", "x.md", "# x\n\n## Phases\nnot a phase\n")).toContain("not a phase line");
  expect(parseRoadmap("x", "x.md", "# x\n")).toContain("no phases");
  expect(parseRoadmap("x", "x.md", "## Phases\n1. [todo] A — a — after: #9\n")).toContain("#9");
  withRoadmaps({ bad: "nothing" }, (s) => {
    const r = roadmapCommand(s, "next");
    expect(r.code).toBe(1);
    expect(r.out).toContain("no phases");
  });
});

test("several active roadmaps need a name; a name picks one", () => {
  withRoadmaps({ book, move: book.replace("Write my novel", "Move house") }, (s) => {
    const all = roadmapCommand(s, "next");
    expect(all.code).toBe(1);
    expect(all.out).toContain("several active");
    const one = roadmapCommand(s, "next", "move");
    expect(one.code).toBe(0);
    expect(one.out).toContain("phase: 2 [todo] First draft");
    expect(one.out).toContain("previous: #1 2026-11-01-outline");
    expect(one.out).toContain("next: #3 Print");
    expect(roadmapCommand(s, "next", "nope").code).toBe(1);
  });
});

test("no roadmaps lists cleanly, and a finished one is not active", () => {
  withRoadmaps({}, (s) => expect(roadmapCommand(s, "list")).toEqual({ out: "no roadmaps", code: 0 }));
  withRoadmaps({ a: "## Phases\n1. [done] A — a\n" }, (s) => {
    expect(roadmapCommand(s, "list").out).toContain("(finished)");
    expect(roadmapCommand(s, "next").out).toBe("no active roadmap");
  });
});
