import { expect, test } from "bun:test";

// The stored look without a browser: a fake localStorage, matchMedia and <html>.
const g = globalThis as any;
const mem = new Map<string, string>();
g.localStorage = { getItem: (k: string) => mem.get(k) ?? null };
let width = 1400;
g.matchMedia = (q: string) => ({
  matches: q.includes("1100") ? width <= 1100 : q.includes("640") ? width <= 640 : false,
});
g.window = g;
const { applyStoredLook, folded } = await import("./stored-look.ts");
const html = () =>
  ({
    dataset: {} as Record<string, string>,
    classList: {
      cls: [] as string[],
      add(c: string) {
        this.cls.push(c);
      },
    },
  }) as any;

test("the stored theme, colour and motion are on <html> before the page draws", () => {
  mem.clear();
  mem.set("kz-theme", "dark");
  mem.set("kz-color", "blue");
  mem.set("kz-motion", "reduce");
  const r = html();
  applyStoredLook(r);
  expect(r.dataset).toMatchObject({ theme: "dark", color: "blue", motion: "reduce", rail: "full", hide: "0" });
  mem.clear();
  const bare = html();
  applyStoredLook(bare);
  expect(bare.dataset.theme).toBeUndefined(); // none stored: the system's
  expect(bare.dataset.color).toBeUndefined();
});

test("the menu fold: the choice wins, else the width, and a phone always gets icons", () => {
  expect(folded("min", false, false)).toBe(true);
  expect(folded("full", true, false)).toBe(false);
  expect(folded(null, true, false)).toBe(true);
  expect(folded(null, false, false)).toBe(false);
  expect(folded("full", true, true)).toBe(true);
  mem.clear();
  mem.set("kz-rail", "min");
  const r = html();
  applyStoredLook(r);
  expect(r.dataset).toMatchObject({ rail: "min", hide: "1" });
  width = 400;
  const p = html();
  applyStoredLook(p);
  expect(p.dataset).toMatchObject({ rail: "min", hide: "0" });
  width = 1400;
});

test("the desktop app's classes", () => {
  mem.clear();
  g.kaizenDesktop = { platform: "darwin" };
  const r = html();
  applyStoredLook(r);
  expect(r.classList.cls).toEqual(["desk", "mac"]);
  delete g.kaizenDesktop;
});
