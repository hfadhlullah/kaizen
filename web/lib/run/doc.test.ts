import { expect, test } from "bun:test";
import { flat, hitNeedle, moved, parseProgress } from "./doc.ts";

test("progress.md reads into steps, a count and a percent", () => {
  const p = parseProgress("# x\n- done: one\n- doing: `two`\n- todo: three\nnote\n- todo: four")!;
  expect(p.steps.map((s) => s.st)).toEqual(["done", "doing", "todo", "todo"]);
  expect(p.done).toBe(1);
  expect(p.pct).toBe(25);
  expect(parseProgress("no list here")).toBeNull();
});

test("a step moved when its status differs from the last draw's", () => {
  const steps = [
    { st: "done" as const, text: "a" },
    { st: "doing" as const, text: "b" },
  ];
  expect(moved(null, steps, 0)).toBe(false);
  expect(moved({ id: "r", st: ["doing", "doing"], w: 0 }, steps, 0)).toBe(true);
  expect(moved({ id: "r", st: ["doing", "doing"], w: 0 }, steps, 1)).toBe(false);
  expect(moved({ id: "r", st: ["doing"], w: 0 }, steps, 1)).toBe(false);
});

test("flat drops markup; hitNeedle finds a finding or a backlog item's line", () => {
  expect(flat("a **b** `c`\n [d](http://x) ![i](y)")).toBe("a b c d i");
  const doc = { backlog: "- open: first `item`\n- done: second", findings: [{ n: 2, text: "A *finding*" }] };
  expect(hitNeedle(doc, { type: "backlog", n: 2 })).toBe("second");
  expect(hitNeedle(doc, { type: "backlog", n: 1 })).toBe("first item");
  expect(hitNeedle(doc, { type: "finding", n: 2 })).toBe("A finding");
  expect(hitNeedle(doc, { type: "finding", n: 9 })).toBeNull();
  expect(hitNeedle({}, { type: "backlog", n: 1 })).toBeNull();
});
