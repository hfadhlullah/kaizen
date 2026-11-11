import { expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { folderSize, measure, parsePs, systemMemory, treeRss } from "./resources.ts";

it("reads available memory, so page cache is not shown as used", () => {
  const m = systemMemory("MemTotal: 1 kB\nMemAvailable:  1024 kB\n");
  expect(m.total - m.used).toBe(1024 * 1024);
});

it("adds a process tree once, whichever roots reach it", () => {
  const t = parsePs("  1 0 10\n  2 1 20\n 3 2 30\n 4 1 40\njunk\n 9 0 90\n");
  expect(t).toHaveLength(5);
  expect(treeRss(t, [2])).toBe(50 * 1024);
  expect(treeRss(t, [1, 2, 3])).toBe(100 * 1024);
  expect(treeRss(t, [777])).toBe(0);
});

const scratch = () => mkdtempSync(join(tmpdir(), "kz-res-"));

it("does not follow symlinks", async () => {
  const d = scratch();
  try {
    mkdirSync(join(d, "a")); mkdirSync(join(d, "big"));
    writeFileSync(join(d, "big", "f"), Buffer.alloc(1 << 20));
    const before = await folderSize(join(d, "a"));
    symlinkSync(join(d, "big"), join(d, "a", "link"), process.platform === "win32" ? "junction" : undefined);
    expect(await folderSize(join(d, "a"))).toBeLessThan(before + 65536);
    expect(await folderSize(join(d, "big"))).toBeGreaterThanOrEqual(1 << 20);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

it("counts a real folder once and a nested root only in its own row", async () => {
  const d = scratch();
  try {
    mkdirSync(join(d, "inst", ".kaizen"), { recursive: true });
    writeFileSync(join(d, "inst", ".kaizen", "f"), Buffer.alloc(1 << 20));
    symlinkSync(join(d, "inst", ".kaizen"), join(d, "alias"), process.platform === "win32" ? "junction" : undefined);
    const r = await measure([
      { name: "inst", dir: "", path: join(d, "inst"), kind: "install" },
      { name: "p", dir: "x", path: join(d, "inst", ".kaizen"), kind: "project" },
      { name: "again", dir: "y", path: join(d, "alias"), kind: "project" },
      { name: "gone", dir: "z", path: join(d, "missing"), kind: "project" },
    ]);
    expect(r.rows.map((x) => x.name)).toEqual(["p", "inst"]);
    expect(r.rows[1].bytes).toBeLessThan(1 << 20);
    expect(r.total).toBe(r.rows[0].bytes + r.rows[1].bytes);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
